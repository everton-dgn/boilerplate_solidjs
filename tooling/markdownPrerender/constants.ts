// Teto do llms-full.txt. Acima dele o build falha, sem truncar o arquivo.
export const LLMS_FULL_MAX_BYTES = 10_485_760
// Teto operacional do índice editorial: acima dele a aplicação precisa selecionar
// o que anuncia. O build falha, sem truncar nem dividir o arquivo.
export const LLMS_MAX_BYTES = 1_048_576
export const LLMS_PATH = '/llms.txt'

export {
  LLMS_DESCRIBEDBY_LINK,
  LLMS_FULL_PATH
} from '../../src/constants/llms.ts'
