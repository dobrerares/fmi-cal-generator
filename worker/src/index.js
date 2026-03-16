export default {
  async fetch(request) {
    return new Response('fmi-cal-worker is running', {
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};
