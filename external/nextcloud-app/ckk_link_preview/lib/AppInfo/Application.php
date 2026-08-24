<?php

declare(strict_types=1);

namespace OCA\CkkLinkPreview\AppInfo;

use OCA\CkkLinkPreview\Reference\CkkReferenceProvider;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;

class Application extends App implements IBootstrap {
	public const APP_ID = 'ckk_link_preview';

	public function __construct(array $urlParams = []) {
		parent::__construct(self::APP_ID, $urlParams);
	}

	public function register(IRegistrationContext $context): void {
		$context->registerReferenceProvider(CkkReferenceProvider::class);
	}

	public function boot(IBootContext $context): void {
	}
}
