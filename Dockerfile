# basescope MCP server — container image for Glama and other MCP hosts.
# The server speaks MCP over stdio; a host runs this image and pipes JSON-RPC
# (initialize / tools/list / tools/call) over stdin/stdout.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Read-only, no keys required. Optional RPC overrides via env
# (BASE_RPC_URL, ETHEREUM_RPC_URL, ...).
ENTRYPOINT ["node", "dist/index.js"]
