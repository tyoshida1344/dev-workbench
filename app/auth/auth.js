// Googleでのログインから戻ってくる先。道具のページへ戻せなかった時だけ、わけを出す。
import { finishSignIn } from '../_lib/drive.js'

const outcome = finishSignIn()
if (outcome.error && !outcome.silent) document.getElementById('message').textContent = outcome.error
