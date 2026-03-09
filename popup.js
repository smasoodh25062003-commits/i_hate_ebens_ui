document.getElementById("launch").addEventListener("click", async () => {
  const msg = document.getElementById("msg");
  msg.style.display = "none";

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    msg.style.display = "block";
    msg.textContent = "No active tab found.";
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    window.close(); // close popup after launching
  } catch (e) {
    msg.style.display = "block";
    msg.textContent = "❌ Could not inject script. Make sure you're on the e-Benefits page.";
    console.error(e);
  }
});
