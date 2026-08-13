import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

/**
 * LIMPEZA DAS CÓPIAS NA STAGING (correção do bug de 13/08/2026).
 *
 * O QUE ACONTECEU: a marca que evita rebaixar do Pandapé só era gravada quando a auditoria da I.A
 * concluía. Enquanto ela não fechava, o ciclo de 12 minutos rebaixava os mesmos bytes e gravava um
 * arquivo novo a cada volta. Uma candidata que enviou 4 páginas de CTPS terminou com 104 arquivos,
 * 26 cópias de cada. A trava já entrou em `StagingService.salvar`; este script limpa o passivo.
 *
 * A REGRA É UMA SÓ: por (admissão + tipo), fica UM arquivo por CONTEÚDO. Conteúdo distinto NUNCA é
 * apagado, e é o hash que decide, não o nome (que tem UUID) nem o tamanho (arquivos diferentes podem
 * ter o mesmo). Fica o mais ANTIGO de cada conteúdo: é o que a auditoria já leu, e manter o primeiro
 * preserva a ordem em que as peças do conjunto foram coletadas.
 *
 * NÃO TOCA O BANCO. Nem `documentos_admissao` (o veredito, inclusive validação humana) nem
 * `documento_arquivos_coletados` (as marcas, que já são únicas por hash). Só remove cópia de arquivo
 * em disco.
 *
 * §A.6: opera por id de admissão e código de tipo, sem nome de candidato, CPF ou nome original de
 * arquivo em log.
 *
 * Uso:  STAGING_DIR=/tmp/ea-staging tsx apps/backend/src/db/limpa-staging-duplicados.ts
 *       LIMPA_DRY=1 ... (só relata, não apaga)
 *       LIMPA_ADMISSAO=<uuid> ... (restringe a uma admissão)
 */
const BASE = process.env.STAGING_DIR ?? "/tmp/ea-staging";
const DRY = process.env.LIMPA_DRY === "1";
const SO_ADMISSAO = process.env.LIMPA_ADMISSAO;

/** O tipo do documento sai do nome do arquivo (`{codigoTipo}__{uuid}.{ext}`), como a staging grava. */
function tipoDoNome(nome: string): string {
  const i = nome.indexOf("__");
  return i > 0 ? nome.slice(0, i) : nome;
}

async function main() {
  const pastas = (await readdir(BASE, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && d.name !== "_kits")
    .map((d) => d.name)
    .filter((nome) => !SO_ADMISSAO || nome === SO_ADMISSAO);

  let totalAntes = 0;
  let totalRemovidos = 0;
  const afetadas: { admissao: string; antes: number; depois: number; bytesLiberados: number }[] = [];

  for (const admissao of pastas) {
    const dir = join(BASE, admissao);
    const nomes = (await readdir(dir)).sort();
    totalAntes += nomes.length;

    // hash do conteúdo, por tipo -> o arquivo que fica.
    const vistos = new Map<string, string>();
    let removidos = 0;
    let bytes = 0;

    for (const nome of nomes) {
      const caminho = join(dir, nome);
      let conteudo: Buffer;
      let tamanho = 0;
      try {
        conteudo = await readFile(caminho);
        tamanho = (await stat(caminho)).size;
      } catch {
        continue; // sumiu no meio da varredura (purge): segue.
      }
      const chave = `${tipoDoNome(nome)}:${createHash("sha256").update(conteudo).digest("hex")}`;
      if (!vistos.has(chave)) {
        vistos.set(chave, nome);
        continue;
      }
      // Cópia: o conteúdo já está preservado no arquivo mais antigo.
      if (!DRY) await unlink(caminho);
      removidos++;
      bytes += tamanho;
    }

    if (removidos > 0) {
      totalRemovidos += removidos;
      afetadas.push({
        admissao,
        antes: nomes.length,
        depois: nomes.length - removidos,
        bytesLiberados: bytes,
      });
    }
  }

  const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
  console.log(`${DRY ? "[DRY] " : ""}Pastas varridas: ${pastas.length} | arquivos: ${totalAntes}`);
  for (const a of afetadas.sort((x, y) => y.antes - x.antes)) {
    console.log(
      `  ${a.admissao}: ${a.antes} -> ${a.depois} (${a.antes - a.depois} cópias, ${mb(a.bytesLiberados)})`,
    );
  }
  console.log(
    `${DRY ? "[DRY] " : ""}Total de cópias ${DRY ? "a remover" : "removidas"}: ${totalRemovidos}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
