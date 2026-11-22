// Googleでのログインから戻ってくる先。道具のページへ戻せなかった時だけ、わけを出す。
import { finishSignIn } from '../_lib/drive.js'

if (finishSignIn().lost) {
  document.title = 'ログインできませんでした — dev-workbench'
  document.getElementById('message').textContent = 'ログインの途中で、開いていたページが分からなくなりました。道具の一覧から開き直してください。'
}
