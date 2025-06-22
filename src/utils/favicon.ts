export const updateFavicon = (t1Time: number | null, t2Time: number | null) => {
  const canvas = document.createElement('canvas');
  canvas.width = 64; // Standard favicon size for better detail
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    console.error("Could not get 2D context for canvas to update favicon.");
    return;
  }

  // Define a radius for the rounded corners
  const cornerRadius = 8; // You can adjust this value

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw rounded background
  ctx.fillStyle = 'white'; // Background color for the favicon
  ctx.beginPath();
  ctx.moveTo(cornerRadius, 0);
  ctx.lineTo(canvas.width - cornerRadius, 0);
  ctx.quadraticCurveTo(canvas.width, 0, canvas.width, cornerRadius);
  ctx.lineTo(canvas.width, canvas.height - cornerRadius);
  ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - cornerRadius, canvas.height);
  ctx.lineTo(cornerRadius, canvas.height);
  ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - cornerRadius);
  ctx.lineTo(0, cornerRadius);
  ctx.quadraticCurveTo(0, 0, cornerRadius, 0);
  ctx.closePath();
  ctx.fill();

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