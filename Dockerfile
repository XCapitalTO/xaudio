FROM node:20-bookworm-slim

# Instalar as dependências de sistema exigidas pelo motor (FFmpeg e Python3)
RUN apt-get update && \
    apt-get install -y ffmpeg python3 curl && \
    rm -rf /var/lib/apt/lists/*

# Definir o diretório de trabalho dentro do container
WORKDIR /app

# Copiar apenas os arquivos de configuração do NPM primeiro (para aproveitar cache do Docker)
COPY package.json ./

# Instalar dependências do Node
# A variável ambiente serve para ignorar falsos positivos de detecção do Python
ENV YOUTUBE_DL_SKIP_PYTHON_CHECK=1
RUN npm install

# Copiar o resto do código fonte para dentro do container
COPY . .

# Expor a porta 3000 que usamos no server.js
EXPOSE 3000

# Comando para rodar o app
CMD ["node", "server.js"]
