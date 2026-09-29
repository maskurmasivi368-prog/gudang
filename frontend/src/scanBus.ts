// Tiny pub/sub so the fullscreen scanner modal can push barcodes back to the
// Receive screen without router param juggling.
type Listener = (barcode: string) => void;

const listeners = new Set<Listener>();

export const scanBus = {
  emit(barcode: string) {
    listeners.forEach((l) => l(barcode));
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
