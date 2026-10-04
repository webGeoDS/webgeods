// Minimal page used by verify-bundle.mjs to prove the bundle works in a
// real browser: local state updating on click, an effect running after
// render, and a portal rendering into an element outside the mount
// point (how article pages place components between paragraphs).
import { useEffect, useState } from "preact/hooks";
import { createPortal } from "preact/compat";

export function SelfTest({ portalTarget }) {

  const [count, setCount] = useState(0);
  const [effectRan, setEffectRan] = useState(false);

  useEffect(() => {
    setEffectRan(true);
  }, []);

  const portalElement =
    portalTarget ? document.querySelector(portalTarget) : null;

  return (
    <div data-self-test>
      <button type="button" onClick={() => setCount(count + 1)}>
        clicked {count}
      </button>
      <span data-effect>{effectRan ? "effect ran" : "no effect"}</span>
      {portalElement && createPortal(<em data-portal>in portal, count {count}</em>, portalElement)}
    </div>
  );

}
