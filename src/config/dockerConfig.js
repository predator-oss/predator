const config = {
    host: process.env.DOCKER_HOST,
    certPath: process.env.DOCKER_CERT_PATH,
    network: process.env.DOCKER_NETWORK
};

module.exports = config;
