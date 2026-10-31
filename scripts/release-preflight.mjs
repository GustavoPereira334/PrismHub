import { readFile } from 'node:fs/promises';
import { createPublicKey } from 'node:crypto';

try {
  const trust = JSON.parse(await readFile(new URL('../src/config/update-trust.json', import.meta.url), 'utf8'));
  if (!process.env.WIN_CSC_LINK && !process.env.CSC_LINK) throw new Error('Configure o certificado de assinatura Windows via WIN_CSC_LINK ou CSC_LINK. Nenhum instalador foi gerado.');
  if (!trust.enabled || !trust.manifestUrl || !trust.publisherSubject || !trust.publicKeyPem) throw new Error('Configure endereço oficial, publicador e chave pública em src/config/update-trust.json antes de distribuir.');
  const url = new URL(trust.manifestUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || createPublicKey(trust.publicKeyPem).asymmetricKeyType !== 'ed25519') throw new Error('Configuração de confiança de atualização inválida.');
  console.log('Pré-requisitos de distribuição presentes. A assinatura real continua obrigatória no electron-builder.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
