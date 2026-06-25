/** Aurora de fundo (assinatura visual). Três blobs em blur, fixos, atrás do conteúdo. */
export function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
    </div>
  );
}
