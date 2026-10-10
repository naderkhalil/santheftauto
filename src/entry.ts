import { startupDiagnostics, startupReportOnly } from './startup-monitor';

// Install lightweight diagnostics before loading/evaluating the game module.
if (!startupReportOnly) void import('./main').catch(error => {
  startupDiagnostics.failure('startup', error);
  console.error('The game module could not load.', error);
  if (!document.getElementById('loading')) {
    const app = document.getElementById('app');
    if (app) {
      const message = document.createElement('p');
      message.textContent = 'The game could not load. Please reload this page to try again.';
      app.replaceChildren(message);
    }
  }
});
