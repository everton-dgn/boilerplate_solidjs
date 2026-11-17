// The transport handler and the error hook run outside the tree and do not reach
// the state of the notice; the events link the two in the browser.
export const REFUSED_SUBMIT_EVENT = 'app:refused-submit'
export const OUTDATED_FALLBACK_EVENT = 'app:outdated-fallback'
