<?php
declare(strict_types=1);
define('CONTACT_ENTRY', true);
require __DIR__ . '/form.php';
?>
<!DOCTYPE html>
<html lang="ja">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title><?= contact_escape($pageTitle) ?>｜谷津干潟ナビ</title>
	<meta name="robots" content="noindex, nofollow">

	<!-- ファビコン -->
	<link rel="icon" type="image/png" href="../assets/images/favicon.png" />

	<!-- Google Fonts プリコネクト（通信の事前接続） -->
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

	<!-- Google Fonts & Icons 一括読み込み（main.cssより前に配置） -->
	<link href="https://fonts.googleapis.com/css2?family=Hannari&family=Noto+Serif+JP:wght@400;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet">

	<!-- メインCSS（最後に読み込むことでフォントが確実に適用される） -->
	<link rel="stylesheet" href="../assets/css/style.css">
	<link rel="stylesheet" href="../assets/css/contact.css">
	
	<!-- 外部JS -->
	<script src="../assets/js/main.js" defer></script>

	<!-- Google tag (gtag.js) -->
	<script async src="https://www.googletagmanager.com/gtag/js?id=G-1NTGB4XW62"></script>
	<script>
	  window.dataLayer = window.dataLayer || [];
	  function gtag(){dataLayer.push(arguments);}
	  gtag('js', new Date());

	  gtag('config', 'G-1NTGB4XW62');
	</script>
</head>

<body>

<div class="wrapper">

	<!-- サイドバー全体 -->
	<header class="sidebar">

		<!-- SP用ハンバーガーボタン -->
		<button type="button" class="sidebar__toggle" id="js-toggle" aria-label="メニューを開く" aria-expanded="false" aria-controls="gnavi">
			<span></span>
			<span></span>
			<span></span>
		</button>

		<!-- ロゴ -->
		<a href="../index.html" class="sidebar__logo">
			<img class="logo__item" src="../assets/images/logo.png" alt="谷津干潟ナビ">
		</a>

		<!-- グローバルナビ -->
		<nav class="gnavi dotted-line-btm" id="gnavi" aria-label="メインナビゲーション">

			<!-- SP用満干時間 -->
			<div class="tidearea sp" aria-live="polite">
				<strong class="tidearea__title" data-tide-date>今日の満干時間</strong>
				<span class="tidearea__time" data-tide-high>満潮　読み込み中</span>
				<span class="tidearea__time" data-tide-low>干潮　読み込み中</span>
			</div>

			<ul>
				<li>
					<a href="../news/index.html" class="gnavi__item">
						<span class="gnavi__engtxt">NEWS</span>
						最新情報
					</a>
				</li>
				<li>
					<a href="../about/index.html" class="gnavi__item">
						<span class="gnavi__engtxt">ABOUT</span>
						谷津干潟とは
					</a>
				</li>
				<li>
					<a href="../guide/index.html" class="gnavi__item">
						<span class="gnavi__engtxt">GUIDE</span>
						観察・散策ガイド
					</a>
				</li>
				<li>
					<a href="../access/index.html" class="gnavi__item">
						<span class="gnavi__engtxt">ACCESS</span>
						アクセス
					</a>
				</li>
				<li>
					<a href="../contact/index.php" class="gnavi__item active" aria-current="page">
						<span class="gnavi__engtxt">CONTACT</span>
						お問い合わせ
					</a>
				</li>
			</ul>
		</nav>
	</header>

	<div class="rightside">
		
		<!-- コンテンツ -->
		<main class="main">

			<!-- メイン部分 -->
			<div class="subpage">
				<h1 class="pagetitle">
			<span class="pagetitle__eng">Contact</span>
					<?= contact_escape($pageTitle) ?>
				</h1>
				
				<!-- 本文 -->
                <div class="formbox">
                    <ol class="form-steps" aria-label="お問い合わせの手順">
                        <?php foreach (['input' => '入力', 'confirm' => '確認', 'complete' => '完了'] as $key => $label): ?>
                        <li<?= $step === $key ? ' aria-current="step"' : '' ?>><?= $label ?></li>
                        <?php endforeach; ?>
                    </ol>
                    <?php if ($errors): ?>
                    <div class="form-errors" role="alert">
                        <p>以下をご確認ください。</p>
                        <ul><?php foreach ($errors as $error): ?><li><?= contact_escape($error) ?></li><?php endforeach; ?></ul>
                    </div>
                    <?php endif; ?>
                    <?php if ($step === 'input'): ?>
				<form method="post" action="index.php">
					<input type="hidden" name="token" value="<?= contact_escape($token) ?>">
					<div class="form-trap" aria-hidden="true"><label>この項目は空欄のままにしてください<input type="text" name="website_check" tabindex="-1" autocomplete="off"></label></div>
					<p class="catch">
						谷津干潟ナビへのご意見・ご感想、掲載内容の訂正、掲載に関するお問い合わせは、こちらからお寄せください。<br>
						当サイトは個人が運営する非公式の地域情報サイトです。施設の利用やイベントについては、各施設へ直接お問い合わせください。
					</p>
					<p class="form__text">
						<span>*</span> は必須項目です
					</p>
					<label class="form__item">
						<strong>企業名・組織名 <small>(任意)</small></strong>
                		<input type="text" name="organization" maxlength="200" value="<?= contact_escape($values['organization']) ?>" autocomplete="organization">
            		</label>
					<label class="form__item">
						<strong class="form__item-name">お名前 <span>*</span></strong>
                		<input type="text" name="name" maxlength="100" value="<?= contact_escape($values['name']) ?>" autocomplete="name" required>
            		</label>
					<label class="form__item">
						<strong class="form__item-name">メールアドレス <span>*</span></strong>
						<input type="email" name="email" maxlength="254" value="<?= contact_escape($values['email']) ?>" autocomplete="email" required>
					</label>
					<label class="form__item">
						<strong class="form__item-name">URL・SNS <small>(任意)</small></strong>
						<input type="text" name="url" maxlength="500" value="<?= contact_escape($values['url']) ?>" autocomplete="url">
					</label>
					<label class="form__item">
                		<strong class="form__item-name">ご意見・お問い合わせ内容 <span>*</span></strong>
                		<textarea name="message" maxlength="5000" rows="5" placeholder="ご自由にご記入ください" required><?= contact_escape($values['message']) ?></textarea>
					</label>
					<p class="form__text">
						ご入力いただいた情報は、お問い合わせへの対応に利用します。個人情報の取り扱いについては、<a href="../privacy/index.html" target="_blank" rel="noopener">プライバシーポリシー（別タブで開きます）</a>をご確認ください。
					</p>
					<div class="form-submit">
						<button type="submit" name="action" value="confirm" class="c-button">確認画面へ</button>
					</div>
				</form>
                    <?php elseif ($step === 'confirm'): ?>
                    <p class="catch">以下の内容で送信します。メールアドレスに誤りがないかご確認ください。</p>
                    <dl class="form-confirm">
                        <?php foreach (['organization' => '企業名・組織名', 'name' => 'お名前', 'email' => 'メールアドレス', 'url' => 'URL・SNS', 'message' => 'ご意見・お問い合わせ内容'] as $key => $label): ?>
                        <div class="form__item">
                            <dt><strong><?= $label ?></strong></dt>
                            <dd><?= contact_escape($values[$key] !== '' ? $values[$key] : '（未入力）') ?></dd>
                        </div>
                        <?php endforeach; ?>
                    </dl>
                    <form method="post" action="index.php" class="form-submit form-actions">
                        <input type="hidden" name="token" value="<?= contact_escape($token) ?>">
                        <button type="submit" name="action" value="back" class="c-button form-back">戻って修正する</button>
                        <button type="submit" name="action" value="send" class="c-button">送信する</button>
                    </form>
                    <?php else: ?>
                    <p class="catch">お問い合わせを受け付けました。<br>谷津干潟ナビへご連絡いただき、ありがとうございます。</p>
                    <p class="form__text">受付番号：<?= contact_escape($result['id']) ?></p>
                    <?php if ($result['reply']): ?>
                    <p class="form__text">ご入力のメールアドレスへ受付メールを送信しました。届かない場合は、迷惑メールフォルダーもご確認ください。</p>
                    <?php else: ?>
                    <p class="form__text">お問い合わせは受け付けましたが、自動返信メールを送信できませんでした。再送信は不要です。</p>
                    <?php endif; ?>
                    <p class="form__text">内容を確認のうえ、必要に応じて返信いたします。返信までお時間をいただく場合があります。</p>
                    <p class="form__text"><a href="../index.html">トップページへ戻る</a></p>
                    <?php endif; ?>
                </div>
			</div>
		</main>
	
		<footer class="footer">
			<a href="../index.html" class="footer__logo">
				<img src="../assets/images/logo.png" alt="谷津干潟ナビ">
			</a>
			<nav aria-label="フッターナビゲーション">
			<ul class="footer__list">
				<li class="footer__item"><a href="../about/master.html">管理人について</a></li>
				<li class="footer__item"><a href="../partner/index.html">協力パートナー募集</a></li>
				<li class="footer__item"><a href="../privacy/index.html">プライバシーポリシー</a></li>
				<li class="footer__item"><a href="../contact/index.php">お問い合わせ</a></li>
			</ul>
			</nav>
			<small class="footer__source">出典：<a href="https://www.data.jma.go.jp/kaiyou/db/tide/suisan/suisan.php?stn=QL" target="_blank" rel="noopener noreferrer">気象庁「千葉」潮位表</a>（加工）</small>
			<small class="footer__copy">Copyright &copy; YATSUHIGATA NAVI. All rights reserved.</small>
		</footer>

	</div>
</div>

</body>
</html>
