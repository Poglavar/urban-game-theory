# Urban Game Theory

The toolkit for decentralized and voluntary urban design.

## Requirements

Before you begin, you need to install the following tools:

- [Node (>= v20.18.3)](https://nodejs.org/en/download/)
- Yarn ([v1](https://classic.yarnpkg.com/en/docs/install/) or [v2+](https://yarnpkg.com/getting-started/install))
- [Git](https://git-scm.com/downloads)

## Quickstart

Clone the repo. Then, to run the application locally, do the following.

1. Run a local network in the first terminal:

```
yarn chain
```

This command starts a local Ethereum network that runs on your local machine and can be used for testing and development.

2. On a second terminal, deploy the smart contracts:

```
yarn deploy
```

This command deploys a test smart contracts to the local network.

4. On a third terminal, start your NextJS app:

```
yarn start
```

Visit your app on: `http://localhost:3000`. You can interact with your smart contracts using the `Debug Contracts` page. You can tweak the app config in `packages/nextjs/scaffold.config.ts`.
