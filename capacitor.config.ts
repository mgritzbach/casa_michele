import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.casamichele.app',
  appName: 'Casa Michele',
  webDir: 'dist',
  server: { androidScheme: 'https' }
};

export default config;
