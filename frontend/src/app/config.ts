import { environment } from '../environments/environment';

interface Config {
  chatEndpoint: string;
}

const config: Record<string, Config> = {
  development: {
    chatEndpoint: '/api/chat'
  },
  production: {
    chatEndpoint: '/api/chat'
  }
};

// Use Angular environment to determine which config to use
const currentEnvironment = environment.production ? 'production' : 'development';

export default config[currentEnvironment];
