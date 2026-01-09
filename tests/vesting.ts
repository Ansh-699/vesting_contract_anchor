import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Vesting } from "../target/types/vesting";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

describe("vesting", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Vesting as Program<Vesting>;

    const companyName = "Company A";
    let vestingAccount: anchor.web3.PublicKey;
    let treasuryTokenAccount: anchor.web3.PublicKey;
    let mint: anchor.web3.PublicKey;

    let employeeAccount: anchor.web3.PublicKey;
    const employee = anchor.web3.Keypair.generate();
    const beneficiary = anchor.web3.Keypair.generate();

    it("create vesting account", async () => {
        mint = await createMint(provider.connection, provider.wallet.payer, provider.wallet.publicKey, null, 6);

        [vestingAccount] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(companyName)],
            program.programId
        );

        [treasuryTokenAccount] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("vesting_treasury"), Buffer.from(companyName)],
            program.programId
        );

        await program.methods
            .createVestingAccount(companyName)
            .accounts({
                signer: provider.wallet.publicKey,
                vestingAccount,
                mint,
                treasuryTokenAccount,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
            } as any)
            .rpc();
    });

    it("create employee vesting", async () => {
        [employeeAccount] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("employee_vesting"), beneficiary.publicKey.toBuffer(), vestingAccount.toBuffer()],
            program.programId
        );

        const now = Math.floor(Date.now() / 1000);
        const startTime = new anchor.BN(now - 10);
        const endTime = new anchor.BN(now + 100);
        const totalAmount = new anchor.BN(1000);
        const cliffTime = new anchor.BN(now - 10);

        await program.methods
            .createEmployeeVesting(startTime, endTime, totalAmount, cliffTime)
            .accounts({
                owner: provider.wallet.publicKey,
                beneficiary: beneficiary.publicKey,
                vestingAccount,
                employeeAccount,
                systemProgram: anchor.web3.SystemProgram.programId,
            } as any)
            .rpc();
    });

    it("claim tokens", async () => {
        await mintTo(provider.connection, provider.wallet.payer, mint, treasuryTokenAccount, provider.wallet.publicKey, 1000000);

        const employeeTokenAccount = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            provider.wallet.payer,
            mint,
            beneficiary.publicKey
        );

        await program.methods
            .claimTokens(companyName)
            .accounts({
                beneficiary: beneficiary.publicKey,
                employeeAccount,
                vestingAccount,
                mint,
                treasuryTokenAccount,
                employeeTokenAccount: employeeTokenAccount.address,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
                associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
            } as any)
            .signers([beneficiary])
            .rpc();
    });
});