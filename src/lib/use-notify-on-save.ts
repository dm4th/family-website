"use client";

import { useEffect, useRef } from "react";

/**
 * Fire `onSaved` exactly once, the first time a form reports a successful save.
 *
 * Written for Smart Intake (PRD 32, slice 2), where a review session can hold
 * more than one form pointed at the same whole-form action and each carries the
 * values it had when the page rendered — so without a signal between saves, the
 * second save silently reverts the first. It lives here rather than beside that
 * feature because the shape is general: any form that must tell its parent
 * "the server changed, re-read it" needs the same one-shot guarantee.
 *
 * Fires once via a ref rather than depending on the callback's identity, so a
 * caller passing an inline function can't turn this into a refetch loop. The
 * effect is also why this exists at all: doing the notify during render (the
 * obvious `if (state.status === "saved") onSaved()`) is a side effect in render,
 * which React may run twice or discard.
 */
export function useNotifyOnSave(saved: boolean, onSaved: () => void) {
  const notified = useRef(false);
  useEffect(() => {
    if (!saved || notified.current) return;
    notified.current = true;
    onSaved();
  }, [saved, onSaved]);
}
