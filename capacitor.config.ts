import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.casamichele.app',
  appName: 'Casa Michele',
  webDir: 'dist',
  plugins: { SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover', style: 'DARK' } },
  server: { androidScheme: 'https' }
};

export default config;
