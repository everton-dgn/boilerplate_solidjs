// Limit of llms-full.txt. Above it the build fails, without truncating the file.
export const LLMS_FULL_MAX_BYTES = 10_485_760
// Operating limit of the editorial index: above it the application must select
// what it announces. The build fails, without truncating or splitting the file.
export const LLMS_MAX_BYTES = 1_048_576
export const LLMS_PATH = '/llms.txt'

export {
  LLMS_DESCRIBEDBY_LINK,
  LLMS_FULL_PATH
} from '../../src/constants/llms.ts'
