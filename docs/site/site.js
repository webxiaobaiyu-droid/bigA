(() => {
  const rawPlatform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
  const platform = rawPlatform.toLowerCase();
  const key = platform.includes('mac')
    ? 'mac'
    : platform.includes('win')
      ? 'windows'
      : platform.includes('linux')
        ? 'linux'
        : '';

  if (!key) return;

  const recommended = document.querySelector(`[data-platform="${key}"]`);
  const badge = recommended?.querySelector('.recommendation');
  const note = document.querySelector('#platform-note');
  const names = { mac: 'macOS', windows: 'Windows', linux: 'Linux' };

  recommended?.classList.add('is-recommended');
  if (badge) badge.hidden = false;
  if (note) note.textContent = `已识别为 ${names[key]}。推荐安装包已标出，点击后会直接下载。`;
})();
