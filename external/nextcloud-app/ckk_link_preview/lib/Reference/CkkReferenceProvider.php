<?php

declare(strict_types=1);

namespace OCA\CkkLinkPreview\Reference;

use OCA\CkkLinkPreview\AppInfo\Application;
use OCP\Collaboration\Reference\IReference;
use OCP\Collaboration\Reference\IReferenceProvider;
use OCP\Collaboration\Reference\Reference;
use OCP\Http\Client\IClientService;
use OCP\IConfig;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

/**
 * ckk.kai-lab.net / ckk-dev.kai-lab.net の URL を CKK 業務管理システムの
 * /api/preview/resolve に照会し、閲覧ユーザーの READ 権限に応じた
 * プレビュー文を返す reference provider。
 *
 * 設定（occ config:app:set ckk_link_preview <key> --value <value>）:
 *   api_base      … 照会先 CKK アプリの origin（例 https://ckk.kai-lab.net）
 *   shared_secret … CKK 側 env PREVIEW_SHARED_SECRET と同じ値
 */
class CkkReferenceProvider implements IReferenceProvider {
	private const URL_PATTERN = '/^https:\/\/(ckk|ckk-dev)\.kai-lab\.net\/\S+$/';

	public function __construct(
		private IClientService $clientService,
		private IConfig $config,
		private IUserSession $userSession,
		private LoggerInterface $logger,
	) {
	}

	public function matchReference(string $referenceText): bool {
		return preg_match(self::URL_PATTERN, $referenceText) === 1;
	}

	public function resolveReference(string $referenceText): ?IReference {
		if (!$this->matchReference($referenceText)) {
			return null;
		}
		$apiBase = rtrim(
			$this->config->getAppValue(Application::APP_ID, 'api_base', ''),
			'/',
		);
		$secret = $this->config->getAppValue(Application::APP_ID, 'shared_secret', '');
		if ($apiBase === '' || $secret === '') {
			return null; // 未設定なら標準の OG プレビューに任せる
		}
		$user = $this->userSession->getUser();

		try {
			$client = $this->clientService->newClient();
			$response = $client->get($apiBase . '/api/preview/resolve', [
				'query' => [
					'url' => $referenceText,
					// Samba AD 由来の ID は CKK 側 users.username と同一
					'user' => $user !== null ? $user->getUID() : '',
				],
				'headers' => ['X-Preview-Token' => $secret],
				'timeout' => 5,
			]);
			$data = json_decode((string)$response->getBody(), true);
		} catch (\Throwable $e) {
			$this->logger->info('ckk_link_preview resolve failed: ' . $e->getMessage());
			return null;
		}

		if (!is_array($data) || ($data['matched'] ?? false) !== true) {
			return null;
		}

		$reference = new Reference($referenceText);
		$reference->setTitle((string)($data['title'] ?? 'CKK 業務管理システム'));
		// description は READ 権限があるときだけ返る（業務データ入り）
		$reference->setDescription((string)($data['description'] ?? ''));
		$reference->setUrl($referenceText);
		return $reference;
	}

	/** ユーザーごとに内容が変わるためキャッシュキーにユーザー ID を含める。 */
	public function getCachePrefix(string $referenceId): string {
		$user = $this->userSession->getUser();
		return $user !== null ? $user->getUID() : '';
	}

	public function getCacheKey(string $referenceId): ?string {
		return $referenceId;
	}
}
