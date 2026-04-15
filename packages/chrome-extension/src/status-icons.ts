// ── Status icon SVGs (exact ADO bolt-status paths) ──────────────────

export function statusSvg(
  status: string,
  result: string | null,
): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('role', 'presentation');

  const circle = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'circle',
  );
  circle.setAttribute('cx', '8');
  circle.setAttribute('cy', '8');
  circle.setAttribute('r', '8');

  if (status === 'inProgress') {
    svg.classList.add('apv-icon', 'apv-icon--running');
    svg.appendChild(circle);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      'M4.75 8a3.25 3.25 0 0 1 1.917-2.965c.33-.148.583-.453.583-.814 0-.479-.432-.848-.881-.683A4.752 4.752 0 0 0 3.29 8.62c.064.49.616.697 1.043.45.303-.175.443-.528.423-.877A3.304 3.304 0 0 1 4.75 8zm6.5 0c0 .065-.002.13-.006.194-.02.349.12.702.422.877.428.247.98.04 1.044-.45a4.752 4.752 0 0 0-3.078-5.084c-.45-.164-.882.205-.882.684 0 .36.253.666.583.814A3.25 3.25 0 0 1 11.25 8zM8 11.25c.758 0 1.455-.26 2.008-.694.293-.23.696-.31 1.019-.123.402.233.51.77.167 1.083A4.733 4.733 0 0 1 8 12.75c-1.23 0-2.35-.467-3.194-1.234-.344-.312-.235-.85.168-1.083.322-.186.725-.108 1.018.123.553.435 1.25.694 2.008.694z',
    );
    path.setAttribute('fill', '#fff');
    svg.appendChild(path);
    return svg;
  }

  if (status === 'notStarted') {
    svg.classList.add('apv-icon', 'apv-icon--queued');
    circle.setAttribute('r', '7');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', 'currentColor');
    circle.setAttribute('stroke-width', '2');
    svg.appendChild(circle);
    return svg;
  }

  const iconPath = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'path',
  );

  if (result === 'succeeded') {
    svg.classList.add('apv-icon', 'apv-icon--succeeded');
    svg.appendChild(circle);
    iconPath.setAttribute(
      'd',
      'M6.062 11.144l-.003-.002-1.784-1.785A.937.937 0 1 1 5.6 8.031l1.125 1.124 3.88-3.88A.937.937 0 1 1 11.931 6.6l-4.54 4.54-.004.004a.938.938 0 0 1-1.325 0z',
    );
    iconPath.setAttribute('fill', '#fff');
    svg.appendChild(iconPath);
  } else if (result === 'failed') {
    svg.classList.add('apv-icon', 'apv-icon--failed');
    svg.appendChild(circle);
    iconPath.setAttribute(
      'd',
      'M10.984 5.004a.9.9 0 0 1 0 1.272L9.27 7.99l1.74 1.741a.9.9 0 1 1-1.272 1.273l-1.74-1.741-1.742 1.74a.9.9 0 1 1-1.272-1.272l1.74-1.74-1.713-1.714a.9.9 0 0 1 1.273-1.273l1.713 1.713 1.714-1.713a.9.9 0 0 1 1.273 0z',
    );
    iconPath.setAttribute('fill', '#fff');
    svg.appendChild(iconPath);
  } else if (result === 'partiallySucceeded') {
    svg.classList.add('apv-icon', 'apv-icon--partial');
    svg.appendChild(circle);
    iconPath.setAttribute('d', 'M7.25 4.5h1.5v4.5h-1.5zm0 6h1.5V12h-1.5z');
    iconPath.setAttribute('fill', '#fff');
    svg.appendChild(iconPath);
  } else if (result === 'canceled') {
    svg.classList.add('apv-icon', 'apv-icon--canceled');
    svg.appendChild(circle);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '4.5');
    rect.setAttribute('y', '6.75');
    rect.setAttribute('width', '7');
    rect.setAttribute('height', '2.5');
    rect.setAttribute('rx', '1');
    rect.setAttribute('fill', '#fff');
    svg.appendChild(rect);
  } else {
    svg.classList.add('apv-icon', 'apv-icon--queued');
    circle.setAttribute('r', '7');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', 'currentColor');
    circle.setAttribute('stroke-width', '2');
    svg.appendChild(circle);
  }

  return svg;
}
