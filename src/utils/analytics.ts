import ReactGA from 'react-ga4';

export const trackEvent = (eventName: string, eventParams?: Record<string, any>) => {
  if (process.env.NODE_ENV === 'production') {
    ReactGA.event(eventName, eventParams);
    console.log(`GA Event: ${eventName}`, eventParams);
  } else {
    console.log(`GA Event (Dev Mode): ${eventName}`, eventParams);
  }
};