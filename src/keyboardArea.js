// Phones do not shrink the page when the on-screen keyboard opens: only the visible area
// (window.visualViewport) shrinks, so a window centred on the full screen can end up under the
// keyboard. While a keyboard is up this publishes that visible area for the windows to centre in:
//   <html data-kb>  and  --kb-top (top edge), --kb-h (height), --kb-mid (vertical centre), all in px.
// With no keyboard nothing is set, so every window keeps its normal position. Pinch-zoom also
// changes the visual viewport, so it is ignored (scale > 1), and so is any drop under 150px
// (a collapsing address bar, not a keyboard). Browsers that shrink the layout itself (innerHeight
// follows) need no help and never trigger this.
const MIN_KEYBOARD_PX = 150

export function keyboardUp() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  return !!vv && vv.scale <= 1.01 && vv.height < window.innerHeight - MIN_KEYBOARD_PX
}

export function installKeyboardArea() {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  const update = () => {
    if (keyboardUp()) {
      root.setAttribute('data-kb', '')
      root.style.setProperty('--kb-top', `${vv.offsetTop}px`)
      root.style.setProperty('--kb-h', `${vv.height}px`)
      root.style.setProperty('--kb-mid', `${vv.offsetTop + vv.height / 2}px`)
    } else {
      root.removeAttribute('data-kb')
      for (const p of ['--kb-top', '--kb-h', '--kb-mid']) root.style.removeProperty(p)
    }
  }
  vv.addEventListener('resize', update)
  vv.addEventListener('scroll', update)
  update()
}
