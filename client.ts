import {
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    isKeyPairSigner,
    MessageSigner,
    Rpc,
    RpcSubscriptions,
    SolanaRpcApi,
    SolanaRpcSubscriptionsApi,
    TransactionSigner,
} from '@solana/kit';
 
export type Client = {
    rpc: Rpc<SolanaRpcApi>;
    rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
    wallet: TransactionSigner & MessageSigner; 
};
 
let client: Client | undefined;
export async function createClient(): Promise<Client> {
    if (!client) {
        // Create RPC objects and airdrop function.
        const rpc = createSolanaRpc('http://127.0.0.1:8899');
        const rpcSubscriptions = createSolanaRpcSubscriptions('ws://127.0.0.1:8900');

        const wallet = 

        client = { rpc, rpcSubscriptions, wallet};
    }
    return client;
}