import {
    appendTransactionMessageInstruction,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    MessageSigner,
    Rpc,
    RpcSubscriptions,
    sendAndConfirmTransactionFactory,
    SolanaRpcApi,
    SolanaRpcSubscriptionsApi,
    TransactionMessage,
    TransactionMessageWithFeePayer,
    TransactionSigner,
} from '@solana/kit';
import { estimateComputeUnitLimitFactory, getSetComputeUnitLimitInstruction } from '@solana-program/compute-budget';
import { loadKeypairFromEnv } from "@solana/client/server";
 
function estimateAndSetComputeUnitLimitFactory(...params: Parameters<typeof estimateComputeUnitLimitFactory>) {
    const estimateComputeUnitLimit = estimateComputeUnitLimitFactory(...params);
    return async <T extends TransactionMessage & TransactionMessageWithFeePayer>(
        transactionMessage: T,
    ) => {
        const computeUnitsEstimate = await estimateComputeUnitLimit(transactionMessage);
        return appendTransactionMessageInstruction(
            getSetComputeUnitLimitInstruction({ units: computeUnitsEstimate }),
            transactionMessage,
        );
    };
}

export type Client = {
    estimateAndSetComputeUnitLimit: ReturnType<typeof estimateAndSetComputeUnitLimitFactory>; 
    rpc: Rpc<SolanaRpcApi>;
    rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
    sendAndConfirmTransaction: ReturnType<typeof sendAndConfirmTransactionFactory>;
    wallet: TransactionSigner & MessageSigner; 
};
 
let client: Client | undefined;
export async function createClient(): Promise<Client> {
    if (!client) {
        // Create RPC objects and airdrop function.
        const rpc = createSolanaRpc(process.env.NEXT_PUBLIC_RPC_URL as string);
        const rpcSubscriptions = createSolanaRpcSubscriptions(process.env.NEXT_PUBLIC_RPC_SUB as string);

        const wallet = (await loadKeypairFromEnv(process.env.NEXT_PUBLIC_PRIVATE_KEY as string)).signer;

        const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({
            rpc,
            rpcSubscriptions,
        });

        const estimateAndSetComputeUnitLimit = estimateAndSetComputeUnitLimitFactory({rpc});
        client = { estimateAndSetComputeUnitLimit, rpc, rpcSubscriptions, sendAndConfirmTransaction, wallet};

    }
    return client;
}