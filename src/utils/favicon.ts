export const updateFavicon = (t1Time: number | null, t2Time: number | null) => {
  const canvas = document.createElement('canvas');
  canvas.width = 64; // Standard favicon size for better detail
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    console.error("Could not get 2D context for canvas to update favicon.");
    return;
  }

  // Clear canvas and set background (white for light mode, dark grey for dark mode)
  // We'll try to match the current theme's background if possible, but a simple white is safer for favicons.
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw T1 label
  ctx.fillStyle = '#333'; // Dark grey for labels
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('T1', canvas.width * 0.25, canvas.height * 0.25);

  // Draw T1 time
  ctx.fillStyle = '#000'; // Black for times
  ctx.font = 'bold 28px Arial';
  ctx.fillText(t1Time !== null ? t1Time.toString() : 'N/A', canvas.width * 0.25, canvas.height * 0.6);

  // Draw T2 label
  ctx.fillStyle = '#333';
  ctx.font = 'bold 14px Arial';
  ctx.fillText('T2', canvas.width * 0.75, canvas.height * 0.25);

  // Draw T2 time
  ctx.fillStyle = '#000';
  ctx.font = 'bold 28px Arial';
  ctx.fillText(t2Time !== null ? t2Time.toString() : 'N/A', canvas.width * 0.75, canvas.height * 0.6);

  // Get the existing favicon link element
  let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']") as HTMLLinkElement;

  // If no favicon link exists, create one
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }

  // Update the favicon's href with the new data URL
  link.href = canvas.toDataURL('image/png');
};