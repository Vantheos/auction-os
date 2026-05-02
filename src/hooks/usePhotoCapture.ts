// src/hooks/usePhotoCapture.ts
// Wraps the device camera input. The native picker is invoked via a hidden
// <input type="file" accept="image/*" capture="environment"> element that
// the consumer renders. On photo capture, the caller's onCapture callback
// receives the Blob; the caller is responsible for handing it to
// useCatalogSession's captureFirst() (no lotId yet) or useCapturePhoto's
// mutate (lotId exists).
//
// Usage:
//   const { openCamera, inputRef, onChange } = usePhotoCapture(handleBlob);
//   ...
//   <input ref={inputRef} type="file" accept="image/*" capture="environment"
//          style={{ display: 'none' }} onChange={onChange} />
//   <button onClick={openCamera}>Capture</button>

import { useCallback, useRef } from 'react';

export function usePhotoCapture(onCapture: (blob: Blob) => void): {
  openCamera: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
} {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openCamera = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onCapture(file);
      // Reset so re-selecting the same file fires onChange again
      e.target.value = '';
    },
    [onCapture]
  );

  return { openCamera, inputRef, onChange };
}
