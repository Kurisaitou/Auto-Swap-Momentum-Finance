# Momentum Finance Auto-Swap Bot — Volume & Airdrop Farming
A lightweight Node.js bot that automatically swaps between two tokens on the Sui blockchain using Momentum Finance CLMM pools.
Built for increasing trading volume and maximizing for airdrop rewards.

<img width="1200" height="700" alt="image" src="https://github.com/user-attachments/assets/974bc358-e885-4309-8d20-fa381a615775" />

## 🚀 Features
- Fully automated swaps between two tokens in a specified Momentum Finance CLMM pool.

- Configurable swap mode: swap entire balance or fixed amounts.

- Adjustable slippage tolerance and swap frequency via .env

- Uses official Momentum Finance SDK for safe and direct smart contract calls.

- Ideal for volume farming and airdrop farming strategies.

## 📦 Installation
Clone the repository and install dependencies:

```bash
git clone https://github.com/Kurisaitou/Auto-Swap-Momentum-Finance.git
```
```bash
cd Auto-Swap-Momentum-Finance
```
```bash
npm install
```

## ⚙️ Environment Setup
Create a .env file in the project root:

```bash
nano .env
```
Fill it with your wallet details and bot configuration:
```bash
# Sui Network Configuration
SUI_PRIVATE_KEY=your suiprivkeyxxxxx....
SUI_RPC_URL=https://fullnode.mainnet.sui.io:443
NETWORK=mainnet

MOMENTUM_CLMM_PACKAGE_ID=0xc84b1ef2ac2ba5c3018e2b8c956ba5d0391e0e46d1daa1926d5a99a6a42526b4
MOMENTUM_GLOBAL_CONFIG=0x9889f38f107f5807d34c547828f4a1b4d814450005a4517a58a1ad476458abfc

MOMENTUM_POOL_ID=0xb0a595cb58d35e07b711ac145b4846c8ed39772c6d6f6716d89d71c64384543b

BASE_TOKEN=0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT
QUOTE_TOKEN=0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC

# Trading Configuration
SWAP_AMOUNT=ALL  # Use "ALL" to swap entire balance, or specify amount like "0.1"
SWAP_INTERVAL_SECONDS=5
SLIPPAGE_TOLERANCE=0.001

# Logging
LOG_LEVEL=info
```

## ▶️ Running the Bot
Start the bot with:
```bash
node index.js
```

## 🛠 How It Works
- Connects to the Sui blockchain using your RPC endpoint.

- Reads token balances from your wallet.

- Executes swaps between BASE_TOKEN and QUOTE_TOKEN in the specified CLMM pool.

- Uses your configured slippage tolerance and interval timing.

- Repeats indefinitely — increasing trading volume for airdrop farming.

## 🔖 Tags
#momentumfinance #sui #airdrop #swap #bot #crypto #web3 #automation #trading #dex #clmm #volume #farming
