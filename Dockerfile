# Trading Intelligence Dashboard
FROM node:18-alpine

# Install Python for VIGL pattern detection
RUN apk add --no-cache python3 py3-pip python3-dev build-base

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Install Python dependencies
RUN pip3 install pandas numpy requests yfinance

# Copy application code
COPY . .

# Create data and logs directories
RUN mkdir -p logs data

# Set permissions
RUN chmod +x scripts/*.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Expose port
EXPOSE 3001

# Start application
CMD ["npm", "start"]