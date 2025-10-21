export function createMockVideo() {
  // Generate a random pastel background Tailwind class for the video container
  function getRandomPastelBgClass() {
    // Pick from some tailwind pastel backgrounds (e.g. bg-pink-100, bg-indigo-100, etc.)
    const classes = [
      "bg-pink-100", "bg-blue-100", "bg-purple-100",
      "bg-yellow-100", "bg-green-100", "bg-indigo-100",
      "bg-orange-100", "bg-teal-100", "bg-cyan-100"
    ];
    const selection = classes[Math.floor(Math.random() * classes.length)];
    console.log('[MockChat] Selected pastel background color:', selection);
    return selection;
  }
  const bgColor = getRandomPastelBgClass();
  const newVideo = <div className={`h-full w-full ${bgColor}`}></div>
  return newVideo;
}