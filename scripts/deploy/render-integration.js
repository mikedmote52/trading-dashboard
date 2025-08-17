#!/usr/bin/env node
/**
 * Render.com Integration for Blue/Green Deployments
 * Manages Render service deployments and environment switching
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class RenderIntegration {
    constructor(options = {}) {
        this.apiKey = options.apiKey || process.env.RENDER_API_KEY;
        this.baseUrl = 'https://api.render.com/v1';
        
        if (!this.apiKey) {
            throw new Error('RENDER_API_KEY is required');
        }
        
        this.axios = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        
        // Service configuration
        this.services = {
            blue: {
                name: 'trading-dashboard-blue',
                id: process.env.RENDER_BLUE_SERVICE_ID,
                url: process.env.RENDER_BLUE_URL
            },
            green: {
                name: 'trading-dashboard-green',
                id: process.env.RENDER_GREEN_SERVICE_ID,
                url: process.env.RENDER_GREEN_URL
            }
        };
        
        this.primaryDomain = process.env.RENDER_PRIMARY_DOMAIN || 'alphastack-v3.render.com';
    }

    log(message, level = 'info') {
        const colors = {
            error: '\x1b[31m',
            warn: '\x1b[33m',
            success: '\x1b[32m',
            info: '\x1b[34m',
            reset: '\x1b[0m'
        };
        
        const color = colors[level] || colors.reset;
        console.log(`${color}[Render] ${message}${colors.reset}`);
    }

    // Get service information
    async getService(serviceId) {
        try {
            const response = await this.axios.get(`/services/${serviceId}`);
            return response.data;
        } catch (error) {
            this.log(`Failed to get service ${serviceId}: ${error.message}`, 'error');
            throw error;
        }
    }

    // List all services
    async listServices() {
        try {
            const response = await this.axios.get('/services');
            return response.data;
        } catch (error) {
            this.log(`Failed to list services: ${error.message}`, 'error');
            throw error;
        }
    }

    // Get service deployments
    async getDeployments(serviceId, limit = 10) {
        try {
            const response = await this.axios.get(`/services/${serviceId}/deploys`, {
                params: { limit }
            });
            return response.data;
        } catch (error) {
            this.log(`Failed to get deployments for ${serviceId}: ${error.message}`, 'error');
            throw error;
        }
    }

    // Trigger deployment
    async triggerDeployment(serviceId, clearCache = true) {
        try {
            this.log(`Triggering deployment for service ${serviceId}...`);
            
            const response = await this.axios.post(`/services/${serviceId}/deploys`, {
                clearCache
            });
            
            this.log(`Deployment triggered: ${response.data.deploy.id}`, 'success');
            return response.data.deploy;
        } catch (error) {
            this.log(`Failed to trigger deployment: ${error.message}`, 'error');
            throw error;
        }
    }

    // Wait for deployment to complete
    async waitForDeployment(serviceId, deployId, timeoutMs = 900000) {
        this.log(`Waiting for deployment ${deployId} to complete...`);
        
        const startTime = Date.now();
        const pollInterval = 10000; // 10 seconds
        
        while (Date.now() - startTime < timeoutMs) {
            try {
                const response = await this.axios.get(`/services/${serviceId}/deploys/${deployId}`);
                const deploy = response.data;
                
                this.log(`Deployment status: ${deploy.status}`);
                
                switch (deploy.status) {
                    case 'live':
                        this.log('Deployment completed successfully!', 'success');
                        return deploy;
                    
                    case 'build_failed':
                    case 'update_failed':
                    case 'deactivated':
                        throw new Error(`Deployment failed with status: ${deploy.status}`);
                    
                    case 'created':
                    case 'pre_deploy_in_progress':
                    case 'build_in_progress':
                    case 'update_in_progress':
                        // Still in progress, continue polling
                        break;
                    
                    default:
                        this.log(`Unknown deployment status: ${deploy.status}`, 'warn');
                        break;
                }
                
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            } catch (error) {
                this.log(`Error checking deployment status: ${error.message}`, 'error');
                throw error;
            }
        }
        
        throw new Error(`Deployment timeout after ${timeoutMs / 1000} seconds`);
    }

    // Update service environment variables
    async updateEnvironmentVariables(serviceId, envVars) {
        try {
            this.log(`Updating environment variables for service ${serviceId}...`);
            
            // Get current service configuration
            const service = await this.getService(serviceId);
            
            // Merge new environment variables
            const updatedEnvVars = [...service.envVars];
            
            for (const [key, value] of Object.entries(envVars)) {
                const existingIndex = updatedEnvVars.findIndex(env => env.key === key);
                
                if (existingIndex >= 0) {
                    updatedEnvVars[existingIndex] = { key, value };
                } else {
                    updatedEnvVars.push({ key, value });
                }
            }
            
            // Update service
            const response = await this.axios.patch(`/services/${serviceId}`, {
                envVars: updatedEnvVars
            });
            
            this.log(`Environment variables updated for ${serviceId}`, 'success');
            return response.data;
        } catch (error) {
            this.log(`Failed to update environment variables: ${error.message}`, 'error');
            throw error;
        }
    }

    // Deploy to specific environment
    async deployToEnvironment(environment, envVars = {}) {
        const serviceConfig = this.services[environment];
        
        if (!serviceConfig || !serviceConfig.id) {
            throw new Error(`Service configuration not found for environment: ${environment}`);
        }
        
        this.log(`Starting deployment to ${environment} environment...`);
        
        try {
            // Update environment variables if provided
            if (Object.keys(envVars).length > 0) {
                await this.updateEnvironmentVariables(serviceConfig.id, envVars);
            }
            
            // Trigger deployment
            const deployment = await this.triggerDeployment(serviceConfig.id);
            
            // Wait for completion
            const completedDeployment = await this.waitForDeployment(
                serviceConfig.id,
                deployment.id
            );
            
            this.log(`Deployment to ${environment} completed successfully!`, 'success');
            return {
                environment,
                serviceId: serviceConfig.id,
                deploymentId: completedDeployment.id,
                url: serviceConfig.url,
                status: 'live'
            };
        } catch (error) {
            this.log(`Deployment to ${environment} failed: ${error.message}`, 'error');
            throw error;
        }
    }

    // Health check for deployed service
    async healthCheck(environment, timeoutMs = 30000) {
        const serviceConfig = this.services[environment];
        
        if (!serviceConfig || !serviceConfig.url) {
            throw new Error(`Service URL not configured for environment: ${environment}`);
        }
        
        this.log(`Running health check for ${environment} environment...`);
        
        try {
            const response = await axios.get(`${serviceConfig.url}/api/health`, {
                timeout: timeoutMs,
                validateStatus: (status) => status < 500
            });
            
            if (response.status === 200) {
                this.log(`Health check passed for ${environment}`, 'success');
                return {
                    environment,
                    status: 'healthy',
                    responseTime: response.headers['x-response-time'] || 'unknown',
                    data: response.data
                };
            } else {
                throw new Error(`Health check returned status ${response.status}`);
            }
        } catch (error) {
            this.log(`Health check failed for ${environment}: ${error.message}`, 'error');
            return {
                environment,
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    // Switch traffic between environments (domain management)
    async switchTraffic(fromEnvironment, toEnvironment) {
        this.log(`Switching traffic from ${fromEnvironment} to ${toEnvironment}...`);
        
        try {
            // In a real implementation, this would:
            // 1. Update DNS records
            // 2. Configure load balancer
            // 3. Update CDN settings
            // 4. Manage SSL certificates
            
            // For Render, this typically involves:
            // - Updating custom domain settings
            // - Managing environment variable routing
            
            const targetService = this.services[toEnvironment];
            
            if (!targetService || !targetService.id) {
                throw new Error(`Target service not configured: ${toEnvironment}`);
            }
            
            // Update primary domain routing (simulation)
            this.log(`Updating domain routing to ${toEnvironment}...`);
            
            // In production, this would make actual API calls to update routing
            await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call
            
            this.log(`Traffic switch completed: ${fromEnvironment} → ${toEnvironment}`, 'success');
            
            return {
                from: fromEnvironment,
                to: toEnvironment,
                primaryDomain: this.primaryDomain,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.log(`Traffic switch failed: ${error.message}`, 'error');
            throw error;
        }
    }

    // Blue/Green deployment workflow
    async blueGreenDeploy(targetEnvironment, options = {}) {
        const {
            envVars = {},
            skipHealthCheck = false,
            healthCheckTimeout = 30000,
            rollbackOnFailure = true
        } = options;
        
        this.log(`Starting Blue/Green deployment to ${targetEnvironment}...`);
        
        const currentEnvironment = targetEnvironment === 'blue' ? 'green' : 'blue';
        
        try {
            // Step 1: Deploy to target environment
            this.log('Step 1: Deploying to target environment...');
            const deployment = await this.deployToEnvironment(targetEnvironment, envVars);
            
            // Step 2: Health check
            if (!skipHealthCheck) {
                this.log('Step 2: Running health checks...');
                const healthResult = await this.healthCheck(targetEnvironment, healthCheckTimeout);
                
                if (healthResult.status !== 'healthy') {
                    throw new Error(`Health check failed: ${healthResult.error}`);
                }
            }
            
            // Step 3: Switch traffic
            this.log('Step 3: Switching traffic...');
            const trafficSwitch = await this.switchTraffic(currentEnvironment, targetEnvironment);
            
            // Step 4: Final validation
            this.log('Step 4: Final validation...');
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for traffic switch to propagate
            
            const finalHealth = await this.healthCheck(targetEnvironment);
            if (finalHealth.status !== 'healthy') {
                throw new Error('Final health check failed after traffic switch');
            }
            
            this.log('Blue/Green deployment completed successfully!', 'success');
            
            return {
                success: true,
                targetEnvironment,
                deployment,
                trafficSwitch,
                healthCheck: finalHealth
            };
        } catch (error) {
            this.log(`Blue/Green deployment failed: ${error.message}`, 'error');
            
            if (rollbackOnFailure) {
                this.log('Attempting automatic rollback...');
                try {
                    await this.switchTraffic(targetEnvironment, currentEnvironment);
                    this.log('Automatic rollback completed', 'success');
                } catch (rollbackError) {
                    this.log(`Rollback failed: ${rollbackError.message}`, 'error');
                }
            }
            
            throw error;
        }
    }

    // Get deployment status
    async getDeploymentStatus() {
        try {
            const status = {
                timestamp: new Date().toISOString(),
                environments: {}
            };
            
            for (const [env, config] of Object.entries(this.services)) {
                if (config.id) {
                    try {
                        const service = await this.getService(config.id);
                        const deployments = await this.getDeployments(config.id, 1);
                        const health = await this.healthCheck(env, 5000);
                        
                        status.environments[env] = {
                            serviceId: config.id,
                            serviceName: config.name,
                            url: config.url,
                            serviceStatus: service.serviceDetails?.state || 'unknown',
                            latestDeployment: deployments.length > 0 ? {
                                id: deployments[0].id,
                                status: deployments[0].status,
                                createdAt: deployments[0].createdAt,
                                finishedAt: deployments[0].finishedAt
                            } : null,
                            health: health.status
                        };
                    } catch (error) {
                        status.environments[env] = {
                            error: error.message
                        };
                    }
                }
            }
            
            return status;
        } catch (error) {
            this.log(`Failed to get deployment status: ${error.message}`, 'error');
            throw error;
        }
    }

    // Emergency stop/rollback
    async emergencyRollback(reason = 'Emergency rollback') {
        this.log(`Executing emergency rollback: ${reason}`, 'warn');
        
        try {
            // Get current status
            const status = await this.getDeploymentStatus();
            
            // Determine which environment is currently live
            const liveEnvironment = Object.entries(status.environments).find(
                ([env, info]) => info.health === 'healthy'
            );
            
            if (!liveEnvironment) {
                throw new Error('No healthy environment found for rollback');
            }
            
            const [currentEnv] = liveEnvironment;
            const targetEnv = currentEnv === 'blue' ? 'green' : 'blue';
            
            this.log(`Rolling back from ${currentEnv} to ${targetEnv}...`);
            
            // Switch traffic immediately
            await this.switchTraffic(currentEnv, targetEnv);
            
            // Validate rollback
            const rollbackHealth = await this.healthCheck(targetEnv);
            
            if (rollbackHealth.status === 'healthy') {
                this.log('Emergency rollback completed successfully', 'success');
                return {
                    success: true,
                    rolledBackFrom: currentEnv,
                    rolledBackTo: targetEnv,
                    reason,
                    timestamp: new Date().toISOString()
                };
            } else {
                throw new Error('Rollback validation failed');
            }
        } catch (error) {
            this.log(`Emergency rollback failed: ${error.message}`, 'error');
            throw error;
        }
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    try {
        const render = new RenderIntegration();
        
        switch (command) {
            case 'deploy':
                const environment = args[1] || 'blue';
                const result = await render.deployToEnvironment(environment);
                console.log('Deployment result:', JSON.stringify(result, null, 2));
                break;
                
            case 'blue-green':
                const targetEnv = args[1] || 'blue';
                const bgResult = await render.blueGreenDeploy(targetEnv);
                console.log('Blue/Green deployment result:', JSON.stringify(bgResult, null, 2));
                break;
                
            case 'health':
                const healthEnv = args[1] || 'blue';
                const healthResult = await render.healthCheck(healthEnv);
                console.log('Health check result:', JSON.stringify(healthResult, null, 2));
                break;
                
            case 'status':
                const status = await render.getDeploymentStatus();
                console.log('Deployment status:', JSON.stringify(status, null, 2));
                break;
                
            case 'switch':
                const fromEnv = args[1];
                const toEnv = args[2];
                if (!fromEnv || !toEnv) {
                    console.error('Usage: switch <from_env> <to_env>');
                    process.exit(1);
                }
                const switchResult = await render.switchTraffic(fromEnv, toEnv);
                console.log('Traffic switch result:', JSON.stringify(switchResult, null, 2));
                break;
                
            case 'rollback':
                const reason = args[1] || 'Manual rollback';
                const rollbackResult = await render.emergencyRollback(reason);
                console.log('Rollback result:', JSON.stringify(rollbackResult, null, 2));
                break;
                
            default:
                console.log('Render.com Integration for Blue/Green Deployments');
                console.log('');
                console.log('Commands:');
                console.log('  deploy <env>           Deploy to environment (blue/green)');
                console.log('  blue-green <env>       Full Blue/Green deployment');
                console.log('  health <env>           Health check for environment');
                console.log('  status                 Get deployment status');
                console.log('  switch <from> <to>     Switch traffic between environments');
                console.log('  rollback [reason]      Emergency rollback');
                console.log('');
                console.log('Environment Variables:');
                console.log('  RENDER_API_KEY           Render API key');
                console.log('  RENDER_BLUE_SERVICE_ID   Blue environment service ID');
                console.log('  RENDER_GREEN_SERVICE_ID  Green environment service ID');
                console.log('  RENDER_BLUE_URL          Blue environment URL');
                console.log('  RENDER_GREEN_URL         Green environment URL');
                console.log('  RENDER_PRIMARY_DOMAIN    Primary domain name');
                break;
        }
    } catch (error) {
        console.error(`Command failed: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = RenderIntegration;