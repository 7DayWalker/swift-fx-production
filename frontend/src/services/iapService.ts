// TypeScript resolution shim.
// Expo/Metro still resolves iapService.native.ts on native and iapService.web.ts on web.
export * from './iapService.native';
export { default } from './iapService.native';
