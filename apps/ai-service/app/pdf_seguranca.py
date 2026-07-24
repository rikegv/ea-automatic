"""Detecção de PDF que exige SENHA PARA ABRIR (OST A, Bloco 1).

CAUSA DO FALSO POSITIVO CORRIGIDO AQUI. A checagem anterior vivia no backend e era a busca da string
`/Encrypt` no buffer. Só que `/Encrypt` aparece em QUALQUER PDF com dicionário de criptografia,
inclusive o caso comum em que NÃO há senha de abertura: PDF cifrado só para restringir permissões
(impressão, cópia, edição) ou assinado digitalmente. A CTPS da Silvia era exatamente isso, e o
documento bom foi reprovado.

O CRITÉRIO CERTO é o do padrão PDF: existe senha de USUÁRIO (de abertura)? Isso não se responde
olhando bytes, se responde tentando abrir com senha VAZIA. Quem faz isso aqui é o **pypdf** (já era
dependência declarada do ai-service, usada pelo kit; nenhuma dependência nova entrou):
`PdfReader.decrypt("")` devolve 0 (`PasswordType.NOT_DECRYPTED`) quando a senha vazia não abre, e um
valor não-zero quando abre (o caso "só permissões", que deve seguir para a auditoria normalmente).

REGRA DE OURO DA OST: na dúvida, NÃO marcar como protegido. Qualquer erro de parse, PDF corrompido ou
comportamento inesperado do pypdf devolve False, ou seja, manda para a IA. Preferimos gastar uma
chamada a reprovar documento bom.

§A.6: função pura sobre bytes, sem log, sem nome de arquivo, sem URL, sem PII.
"""

from io import BytesIO

from pypdf import PdfReader

__all__ = ["pdf_exige_senha_para_abrir", "MOTIVO_PDF_PROTEGIDO"]

MOTIVO_PDF_PROTEGIDO = (
    "Documento protegido por senha. Reenviar o arquivo sem proteção para permitir a auditoria."
)


def pdf_exige_senha_para_abrir(conteudo: bytes) -> bool:
    """True SÓ quando o PDF exige senha para ABRIR. Cifrado só por permissões devolve False."""
    if len(conteudo) < 5 or conteudo[:4] != b"%PDF":
        return False
    try:
        leitor = PdfReader(BytesIO(conteudo))
        if not leitor.is_encrypted:
            return False
        # 0 = a senha vazia NÃO abre o documento, então há senha de usuário de verdade.
        return int(leitor.decrypt("")) == 0
    except Exception:
        # Na dúvida (PDF malformado, cifra exótica, pypdf sem suporte), NÃO marca como protegido.
        return False
