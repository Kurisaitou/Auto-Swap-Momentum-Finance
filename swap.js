import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { fromHEX } from '@mysten/sui.js/utils';
import { decodeSuiPrivateKey } from '@mysten/sui.js/cryptography';
import { MmtSDK } from '@mmt-finance/clmm-sdk';

export class MomentumSwapper {
  constructor(privateKey, config) {
    this.config = config;
    this.suiClient = new SuiClient({
      url: config.rpcUrl || getFullnodeUrl(config.network),
    });
    this.keypair = this.createKeypairFromPrivateKey(privateKey);
  }

  getConfig() {
    return this.config;
  }

  async checkBalance() {

    const balances = await this.checkWalletBalance();
    return {
      sui: balances.quote,
      usdc: balances.base,
    };
  }

  async checkWalletBalance() {
    try {
      const address = this.keypair.getPublicKey().toSuiAddress();

      const baseSymbol = (this.config.baseToken || '').split('::').pop() || 'BASE';
      const quoteSymbol = (this.config.quoteToken || '').split('::').pop() || 'QUOTE';

      const suiGasBalance = await this.suiClient.getBalance({
        owner: address,
        coinType:
          '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
      });
      const suiGas = parseInt(suiGasBalance.totalBalance || '0', 10) / 1_000_000_000;

      let baseBalance;
      try {
        baseBalance = await this.suiClient.getBalance({
          owner: address,
          coinType: this.config.baseToken,
        });
      } catch (e) {
        baseBalance = { totalBalance: '0' };
      }

      let quoteBalance;
      try {
        quoteBalance = await this.suiClient.getBalance({
          owner: address,
          coinType: this.config.quoteToken,
        });
      } catch (e) {
        quoteBalance = { totalBalance: '0' };
      }

      const getTokenDecimals = (tokenType) => {
        if (!tokenType) return 1_000_000_000;
        if (tokenType.includes('::sui::SUI')) return 1_000_000_000;
        if (tokenType.toLowerCase().includes('::usdc::') || tokenType.toLowerCase().includes('::usdc')) return 1_000_000;
        if (tokenType.toLowerCase().includes('::usdt::') || tokenType.toLowerCase().includes('::usdt')) return 1_000_000;
        return 1_000_000_000;
      };

      const baseAmount = parseInt(baseBalance.totalBalance || '0', 10) / getTokenDecimals(this.config.baseToken);
      const quoteAmount = parseInt(quoteBalance.totalBalance || '0', 10) / getTokenDecimals(this.config.quoteToken);

      return {
        suiGas,
        base: baseAmount,
        quote: quoteAmount,
        baseSymbol,
        quoteSymbol,
      };
    } catch (error) {
      console.error('❌ Error while checking wallet balance:', error);
      return {
        suiGas: 0,
        base: 0,
        quote: 0,
        baseSymbol: 'BASE',
        quoteSymbol: 'QUOTE',
      };
    }
  }

  async displayWalletBalance() {
    const balances = await this.checkWalletBalance();
    console.log('\n💰 WALLET BALANCE:');
    console.log(`   🟡 SUI (Gas): ${balances.suiGas.toFixed(4)} SUI`);
    console.log(`   🔵 ${balances.baseSymbol} (Base): ${balances.base.toFixed(6)} ${balances.baseSymbol}`);
    console.log(`   🟢 ${balances.quoteSymbol} (Quote): ${balances.quote.toFixed(6)} ${balances.quoteSymbol}`);

    if (balances.suiGas < 0.05) {
      console.log('   ⚠️ Low SUI gas — top up to avoid failed txs.');
    }
    console.log('');
  }

  async swapQuoteToBase() {
    const timestamp = new Date();

    try {
      const baseSymbol = (this.config.baseToken || '').split('::').pop();
      const quoteSymbol = (this.config.quoteToken || '').split('::').pop();

      const quoteCoins = await this.suiClient.getCoins({
        owner: this.keypair.getPublicKey().toSuiAddress(),
        coinType: this.config.quoteToken,
      });

      if (!quoteCoins || !quoteCoins.data || quoteCoins.data.length === 0) {
        throw new Error(`No ${quoteSymbol} coins to swap`);
      }

      const decimals = (() => {
        const t = this.config.quoteToken || '';
        if (t.toLowerCase().includes('usdc') || t.toLowerCase().includes('usdt')) return 1_000_000;
        if (t.includes('::sui::SUI')) return 1_000_000_000;
        return 1_000_000;
      })();

      const totalBalance = quoteCoins.data.reduce((sum, coin) => sum + Number(coin.balance || 0), 0);

      let amountIn;
      let swapAmount;
      if (this.config.useAllBalance) {
        amountIn = totalBalance;
        swapAmount = totalBalance / decimals;
        console.log(`🔄 Starting ALL swap ${swapAmount.toFixed(6)} ${quoteSymbol} -> ${baseSymbol}...`);
      } else {
        amountIn = Math.floor(this.config.amount * decimals);
        swapAmount = this.config.amount;
        console.log(`🔄 Starting swap ${swapAmount} ${quoteSymbol} -> ${baseSymbol}...`);
      }

      const txb = new TransactionBlock();
      txb.setSender(this.keypair.getPublicKey().toSuiAddress());

      let primaryCoin = txb.object(quoteCoins.data[0].coinObjectId);
      if (quoteCoins.data.length > 1) {
        console.log(`🔗 Merging ${quoteCoins.data.length} coins...`);
        const otherCoins = quoteCoins.data.slice(1).map((c) => txb.object(c.coinObjectId));
        txb.mergeCoins(primaryCoin, otherCoins);
      }

      let inputCoin;
      if (this.config.useAllBalance) {
        inputCoin = primaryCoin;
        console.log(`💸 Using full coin (${swapAmount.toFixed(6)} ${quoteSymbol})`);
      } else {
        [inputCoin] = txb.splitCoins(primaryCoin, [txb.pure(amountIn)]);
        console.log(`✂️ Split ${swapAmount} ${quoteSymbol} from balance`);
      }

      const sdk = MmtSDK.NEW({
        network: this.config.network === 'testnet' ? 'testnet' : 'mainnet',
        suiClientUrl: this.config.rpcUrl,
      });

      console.log('🚀 Calling SDK swap...');
      const poolParams = {
        objectId: this.config.poolId,
        tokenXType: this.config.baseToken,
        tokenYType: this.config.quoteToken,
      };

      sdk.Pool.swap(
        txb,
        poolParams,
        BigInt(amountIn),
        inputCoin,
        false,
        this.keypair.getPublicKey().toSuiAddress(),
        BigInt(0),
        false
      );

      if (!this.config.useAllBalance) {
        const senderAddress = this.keypair.getPublicKey().toSuiAddress();
        txb.transferObjects([primaryCoin], senderAddress);
      }

      console.log('🚀 Executing transaction...');

      const result = await this.suiClient.signAndExecuteTransactionBlock({
        signer: this.keypair,
        transactionBlock: txb,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      if (result.effects && result.effects.status && result.effects.status.status === 'success') {
        console.log(`✅ Swap success! TX: ${result.digest}`);
        return {
          success: true,
          txHash: result.digest,
          timestamp,
          amount: swapAmount,
          fromToken: this.config.quoteToken,
          toToken: this.config.baseToken,
        };
      } else {
        throw new Error(`Transaction failed: ${result.effects?.status?.error || 'unknown'}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Swap failed: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
        timestamp,
        amount: this.config.amount,
        fromToken: this.config.quoteToken,
        toToken: this.config.baseToken,
      };
    }
  }

  async swapBaseToQuote() {
    const timestamp = new Date();

    try {
      const baseSymbol = (this.config.baseToken || '').split('::').pop();
      const quoteSymbol = (this.config.quoteToken || '').split('::').pop();

      const baseCoins = await this.suiClient.getCoins({
        owner: this.keypair.getPublicKey().toSuiAddress(),
        coinType: this.config.baseToken,
      });

      if (!baseCoins || !baseCoins.data || baseCoins.data.length === 0) {
        throw new Error(`No ${baseSymbol} coins to swap`);
      }

      const decimals = (() => {
        const t = this.config.baseToken || '';
        if (t.toLowerCase().includes('usdc') || t.toLowerCase().includes('usdt')) return 1_000_000;
        if (t.includes('::sui::SUI')) return 1_000_000_000;
        return 1_000_000;
      })();

      const totalBalance = baseCoins.data.reduce((sum, coin) => sum + Number(coin.balance || 0), 0);

      let amountIn;
      let swapAmount;
      if (this.config.useAllBalance) {
        amountIn = totalBalance;
        swapAmount = totalBalance / decimals;
        console.log(`🔄 Starting ALL swap ${swapAmount.toFixed(6)} ${baseSymbol} -> ${quoteSymbol}...`);
      } else {
        amountIn = Math.floor(this.config.amount * decimals);
        swapAmount = this.config.amount;
        console.log(`🔄 Starting swap ${swapAmount} ${baseSymbol} -> ${quoteSymbol}...`);
      }

      const txb = new TransactionBlock();
      txb.setSender(this.keypair.getPublicKey().toSuiAddress());

      let primaryCoin = txb.object(baseCoins.data[0].coinObjectId);
      if (baseCoins.data.length > 1) {
        console.log(`🔗 Merging ${baseCoins.data.length} coins...`);
        const otherCoins = baseCoins.data.slice(1).map((c) => txb.object(c.coinObjectId));
        txb.mergeCoins(primaryCoin, otherCoins);
      }

      let inputCoin;
      if (this.config.useAllBalance) {
        inputCoin = primaryCoin;
        console.log(`💸 Using full coin (${swapAmount.toFixed(6)} ${baseSymbol})`);
      } else {
        [inputCoin] = txb.splitCoins(primaryCoin, [txb.pure(amountIn)]);
        console.log(`✂️ Split ${swapAmount} ${baseSymbol} from balance`);
      }

      const sdk = MmtSDK.NEW({
        network: this.config.network === 'testnet' ? 'testnet' : 'mainnet',
        suiClientUrl: this.config.rpcUrl,
      });

      sdk.Pool.swap(
        txb,
        {
          objectId: this.config.poolId,
          tokenXType: this.config.baseToken,
          tokenYType: this.config.quoteToken,
        },
        BigInt(amountIn),
        inputCoin,
        true,
        this.keypair.getPublicKey().toSuiAddress(),
        BigInt(0),
        false
      );

      if (!this.config.useAllBalance) {
        const senderAddress = this.keypair.getPublicKey().toSuiAddress();
        txb.transferObjects([primaryCoin], senderAddress);
      }

      console.log('🚀 Executing transaction...');

      const result = await this.suiClient.signAndExecuteTransactionBlock({
        signer: this.keypair,
        transactionBlock: txb,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      if (result.effects && result.effects.status && result.effects.status.status === 'success') {
        console.log(`✅ Swap success! TX: ${result.digest}`);
        return {
          success: true,
          txHash: result.digest,
          timestamp,
          amount: swapAmount,
          fromToken: this.config.baseToken,
          toToken: this.config.quoteToken,
        };
      } else {
        throw new Error(`Transaction failed: ${result.effects?.status?.error || 'unknown'}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Swap failed: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
        timestamp,
        amount: this.config.amount,
        fromToken: this.config.baseToken,
        toToken: this.config.quoteToken,
      };
    }
  }

  createKeypairFromPrivateKey(privateKey) {
    try {

      if (privateKey.startsWith('suiprivkey1')) {
        const decoded = decodeSuiPrivateKey(privateKey);
        return Ed25519Keypair.fromSecretKey(decoded.secretKey);
      }

      if (privateKey.startsWith('0x')) {
        return Ed25519Keypair.fromSecretKey(fromHEX(privateKey));
      }

      if (privateKey.length === 64 && /^[0-9a-fA-F]{64}$/.test(privateKey)) {
        return Ed25519Keypair.fromSecretKey(fromHEX('0x' + privateKey));
      }

      if (privateKey.length === 44) {
        const bytes = Buffer.from(privateKey, 'base64'); 
        return Ed25519Keypair.fromSecretKey(bytes);
      }

      return Ed25519Keypair.fromSecretKey(fromHEX(privateKey.startsWith('0x') ? privateKey : '0x' + privateKey));
    } catch (error) {
      throw new Error(`Cannot create keypair from private key: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getWalletAddress() {
    return this.keypair.getPublicKey().toSuiAddress();
  }

  getTokenSymbol(tokenType) {
    const tokenAddress = tokenType === 'base' ? this.config.baseToken : this.config.quoteToken;
    return tokenAddress.split('::').pop() || tokenType.toUpperCase();
  }
}
