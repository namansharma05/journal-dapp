import {
    appendTransactionMessageInstruction,
    createKeyPairFromBytes,
    createSignerFromKeyPair,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    getBase58Encoder,
    sendAndConfirmTransactionFactory,
    type Rpc,
    type RpcSubscriptions,
    type SolanaRpcApi,
    type SolanaRpcSubscriptionsApi,
    type TransactionMessage,
    type TransactionMessageWithFeePayer,
    type TransactionSigner,
} from '@solana/kit';
import { estimateComputeUnitLimitFactory, getSetComputeUnitLimitInstruction } from '@solana-program/compute-budget';
// import { loadKeypairFromEnv } from "@solana/client/server";
// import { getKeypairFromEnvironment } from '@solana-developers/helpers';
 
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
    wallet: TransactionSigner; 
};
 
let client: Client | undefined;
export async function createClient(): Promise<Client> {
    if (!client) {
        // Create RPC objects and airdrop function.
        const rpc = createSolanaRpc(process.env.NEXT_PUBLIC_RPC_URL as string);
        const rpcSubscriptions = createSolanaRpcSubscriptions(process.env.NEXT_PUBLIC_RPC_SUB as string);

        const wallet = await createSignerFromKeyPair(
            await createKeyPairFromBytes(
                getBase58Encoder().encode(process.env.NEXT_PUBLIC_PRIVATE_KEY as string)
            )
        );

        const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({
            rpc,
            rpcSubscriptions,
        });

        const estimateAndSetComputeUnitLimit = estimateAndSetComputeUnitLimitFactory({rpc});
        client = { estimateAndSetComputeUnitLimit, rpc, rpcSubscriptions, sendAndConfirmTransaction, wallet};

    }
    return client;
}