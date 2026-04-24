declare module "jquery" {
	const jquery: (target: Element | Document | Window | string) => {
		turn: (...args: unknown[]) => unknown;
	};

	export default jquery;
}

declare module "turn.js";
