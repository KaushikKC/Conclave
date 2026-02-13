import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Conclave } from "../target/types/conclave";
import {
  createMint,
  createAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { createHash } from "crypto";

describe("conclave", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Conclave as Program<Conclave>;
  const authority = provider.wallet as anchor.Wallet;

  let governanceMint: PublicKey;
  let authorityTokenAccount: PublicKey;
  let roomPda: PublicKey;
  let memberPda: PublicKey;
  let proposalPda: PublicKey;

  const roomName = "test-dao";
  const proposalTitle = "Fund dev grants";
  const proposalDescription = "Allocate 10k tokens to developer grants";

  before(async () => {
    governanceMint = await createMint(
      provider.connection,
      (authority as any).payer,
      authority.publicKey,
      null,
      9,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    authorityTokenAccount = await createAccount(
      provider.connection,
      (authority as any).payer,
      governanceMint,
      authority.publicKey,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    await mintTo(
      provider.connection,
      (authority as any).payer,
      governanceMint,
      authorityTokenAccount,
      authority.publicKey,
      1_000_000_000,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    [roomPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("room"),
        authority.publicKey.toBuffer(),
        Buffer.from(roomName),
      ],
      program.programId
    );

    [memberPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("member"),
        roomPda.toBuffer(),
        authority.publicKey.toBuffer(),
      ],
      program.programId
    );

    [proposalPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        roomPda.toBuffer(),
        Buffer.from(proposalTitle),
      ],
      program.programId
    );
  });

  describe("create_room", () => {
    it("creates a DAO room", async () => {
      await program.methods
        .createRoom(roomName)
        .accountsPartial({
          authority: authority.publicKey,
          governanceMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          room: roomPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const room = await program.account.daoRoom.fetch(roomPda);
      expect(room.authority.toBase58()).to.equal(
        authority.publicKey.toBase58()
      );
      expect(room.governanceMint.toBase58()).to.equal(
        governanceMint.toBase58()
      );
      expect(room.name).to.equal(roomName);
      expect(room.memberCount).to.equal(0);
      expect(room.proposalCount).to.equal(0);
    });

    it("fails with empty name", async () => {
      try {
        const [emptyRoomPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("room"), authority.publicKey.toBuffer(), Buffer.from("")],
          program.programId
        );
        await program.methods
          .createRoom("")
          .accountsPartial({
            authority: authority.publicKey,
            governanceMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            room: emptyRoomPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("NameEmpty");
      }
    });
  });

  describe("join_room", () => {
    it("allows a token holder to join", async () => {
      const fakeGroupKey = Buffer.alloc(64, 0xab);

      await program.methods
        .joinRoom(fakeGroupKey)
        .accountsPartial({
          wallet: authority.publicKey,
          room: roomPda,
          tokenAccount: authorityTokenAccount,
          member: memberPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const member = await program.account.member.fetch(memberPda);
      expect(member.wallet.toBase58()).to.equal(
        authority.publicKey.toBase58()
      );
      expect(member.room.toBase58()).to.equal(roomPda.toBase58());
      expect(Buffer.from(member.encryptedGroupKey)).to.deep.equal(fakeGroupKey);

      const room = await program.account.daoRoom.fetch(roomPda);
      expect(room.memberCount).to.equal(1);
    });

    it("rejects a user without governance tokens", async () => {
      const noTokenUser = Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(
        noTokenUser.publicKey,
        2_000_000_000
      );
      await provider.connection.confirmTransaction(airdropSig);

      const noTokenAta = await createAccount(
        provider.connection,
        noTokenUser,
        governanceMint,
        noTokenUser.publicKey,
        undefined,
        undefined,
        TOKEN_PROGRAM_ID
      );

      const [noTokenMemberPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("member"),
          roomPda.toBuffer(),
          noTokenUser.publicKey.toBuffer(),
        ],
        program.programId
      );

      try {
        await program.methods
          .joinRoom(Buffer.alloc(64, 0))
          .accountsPartial({
            wallet: noTokenUser.publicKey,
            room: roomPda,
            tokenAccount: noTokenAta,
            member: noTokenMemberPda,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([noTokenUser])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("InsufficientTokens");
      }
    });
  });

  describe("create_proposal", () => {
    it("creates a proposal as a member", async () => {
      const deadline = new anchor.BN(Math.floor(Date.now() / 1000) + 60);

      await program.methods
        .createProposal(proposalTitle, proposalDescription, deadline)
        .accountsPartial({
          creator: authority.publicKey,
          room: roomPda,
          member: memberPda,
          proposal: proposalPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const proposal = await program.account.proposal.fetch(proposalPda);
      expect(proposal.room.toBase58()).to.equal(roomPda.toBase58());
      expect(proposal.creator.toBase58()).to.equal(
        authority.publicKey.toBase58()
      );
      expect(proposal.title).to.equal(proposalTitle);
      expect(proposal.description).to.equal(proposalDescription);
      expect(proposal.voteYesCount).to.equal(0);
      expect(proposal.voteNoCount).to.equal(0);
      expect(proposal.isFinalized).to.equal(false);

      const room = await program.account.daoRoom.fetch(roomPda);
      expect(room.proposalCount).to.equal(1);
    });
  });

  describe("cast_vote & reveal_vote", () => {
    const voteChoice = 1; // yes
    const nonce = Buffer.alloc(32);

    let voteCommitmentPda: PublicKey;
    let commitment: Buffer;

    before(() => {
      // Generate random nonce
      for (let i = 0; i < 32; i++) {
        nonce[i] = Math.floor(Math.random() * 256);
      }

      // Compute commitment = sha256(vote_choice + nonce)
      const hasher = createHash("sha256");
      hasher.update(Buffer.from([voteChoice]));
      hasher.update(nonce);
      commitment = hasher.digest();

      [voteCommitmentPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vote"),
          proposalPda.toBuffer(),
          authority.publicKey.toBuffer(),
        ],
        program.programId
      );
    });

    it("casts a vote commitment", async () => {
      await program.methods
        .castVote(Array.from(commitment) as any)
        .accountsPartial({
          voter: authority.publicKey,
          room: roomPda,
          member: memberPda,
          proposal: proposalPda,
          voteCommitment: voteCommitmentPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const vote = await program.account.voteCommitment.fetch(
        voteCommitmentPda
      );
      expect(vote.voter.toBase58()).to.equal(
        authority.publicKey.toBase58()
      );
      expect(vote.proposal.toBase58()).to.equal(proposalPda.toBase58());
      expect(Buffer.from(vote.commitment)).to.deep.equal(commitment);
      expect(vote.isRevealed).to.equal(false);
    });

    it("fails to reveal before deadline", async () => {
      try {
        await program.methods
          .revealVote(voteChoice, Array.from(nonce) as any)
          .accountsPartial({
            voter: authority.publicKey,
            proposal: proposalPda,
            voteCommitment: voteCommitmentPda,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("DeadlineNotReached");
      }
    });
  });

  describe("cast_vote & reveal_vote (with expired deadline)", () => {
    const proposalTitle2 = "Expired proposal";
    const voteChoice = 0; // no
    const nonce = Buffer.alloc(32);
    let proposalPda2: PublicKey;
    let voteCommitmentPda2: PublicKey;
    let commitment: Buffer;

    before(async () => {
      for (let i = 0; i < 32; i++) {
        nonce[i] = Math.floor(Math.random() * 256);
      }

      const hasher = createHash("sha256");
      hasher.update(Buffer.from([voteChoice]));
      hasher.update(nonce);
      commitment = hasher.digest();

      [proposalPda2] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("proposal"),
          roomPda.toBuffer(),
          Buffer.from(proposalTitle2),
        ],
        program.programId
      );

      [voteCommitmentPda2] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vote"),
          proposalPda2.toBuffer(),
          authority.publicKey.toBuffer(),
        ],
        program.programId
      );

      // Create proposal with a 2-second deadline
      const deadline = new anchor.BN(Math.floor(Date.now() / 1000) + 2);

      await program.methods
        .createProposal(proposalTitle2, "Short-lived proposal", deadline)
        .accountsPartial({
          creator: authority.publicKey,
          room: roomPda,
          member: memberPda,
          proposal: proposalPda2,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Cast vote before deadline
      await program.methods
        .castVote(Array.from(commitment) as any)
        .accountsPartial({
          voter: authority.publicKey,
          room: roomPda,
          member: memberPda,
          proposal: proposalPda2,
          voteCommitment: voteCommitmentPda2,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Wait for deadline to pass
      await new Promise((resolve) => setTimeout(resolve, 3000));
    });

    it("reveals vote after deadline", async () => {
      await program.methods
        .revealVote(voteChoice, Array.from(nonce) as any)
        .accountsPartial({
          voter: authority.publicKey,
          proposal: proposalPda2,
          voteCommitment: voteCommitmentPda2,
        })
        .rpc();

      const proposal = await program.account.proposal.fetch(proposalPda2);
      expect(proposal.voteNoCount).to.equal(1);
      expect(proposal.voteYesCount).to.equal(0);

      const vote = await program.account.voteCommitment.fetch(
        voteCommitmentPda2
      );
      expect(vote.isRevealed).to.equal(true);
    });

    it("fails to reveal a second time", async () => {
      try {
        await program.methods
          .revealVote(voteChoice, Array.from(nonce) as any)
          .accountsPartial({
            voter: authority.publicKey,
            proposal: proposalPda2,
            voteCommitment: voteCommitmentPda2,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("AlreadyRevealed");
      }
    });

    it("fails with wrong nonce", async () => {
      // Create a new proposal and vote for this test
      const proposalTitle3 = "Wrong nonce test";
      const wrongNonce = Buffer.alloc(32, 0xff);
      const correctNonce = Buffer.alloc(32, 0xaa);
      const choice = 1;

      const hasher = createHash("sha256");
      hasher.update(Buffer.from([choice]));
      hasher.update(correctNonce);
      const commit = hasher.digest();

      const [proposalPda3] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("proposal"),
          roomPda.toBuffer(),
          Buffer.from(proposalTitle3),
        ],
        program.programId
      );

      const [votePda3] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vote"),
          proposalPda3.toBuffer(),
          authority.publicKey.toBuffer(),
        ],
        program.programId
      );

      const deadline = new anchor.BN(Math.floor(Date.now() / 1000) + 2);

      await program.methods
        .createProposal(proposalTitle3, "Testing wrong nonce", deadline)
        .accountsPartial({
          creator: authority.publicKey,
          room: roomPda,
          member: memberPda,
          proposal: proposalPda3,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .castVote(Array.from(commit) as any)
        .accountsPartial({
          voter: authority.publicKey,
          room: roomPda,
          member: memberPda,
          proposal: proposalPda3,
          voteCommitment: votePda3,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await new Promise((resolve) => setTimeout(resolve, 3000));

      try {
        await program.methods
          .revealVote(choice, Array.from(wrongNonce) as any)
          .accountsPartial({
            voter: authority.publicKey,
            proposal: proposalPda3,
            voteCommitment: votePda3,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("CommitmentMismatch");
      }
    });
  });

  describe("send_message", () => {
    it("sends an encrypted message", async () => {
      const timestamp = new anchor.BN(Math.floor(Date.now() / 1000));
      const ciphertext = Buffer.from("encrypted-hello-world", "utf8");

      const [messagePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("message"),
          roomPda.toBuffer(),
          authority.publicKey.toBuffer(),
          timestamp.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      await program.methods
        .sendMessage(ciphertext, timestamp)
        .accountsPartial({
          sender: authority.publicKey,
          room: roomPda,
          member: memberPda,
          message: messagePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const message = await program.account.message.fetch(messagePda);
      expect(message.room.toBase58()).to.equal(roomPda.toBase58());
      expect(message.sender.toBase58()).to.equal(
        authority.publicKey.toBase58()
      );
      expect(Buffer.from(message.ciphertext).toString("utf8")).to.equal(
        "encrypted-hello-world"
      );
    });

    it("sends multiple messages with different timestamps", async () => {
      const ts1 = new anchor.BN(Math.floor(Date.now() / 1000) + 100);
      const ts2 = new anchor.BN(Math.floor(Date.now() / 1000) + 200);
      const ct1 = Buffer.from("message-one", "utf8");
      const ct2 = Buffer.from("message-two", "utf8");

      const [msgPda1] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("message"),
          roomPda.toBuffer(),
          authority.publicKey.toBuffer(),
          ts1.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const [msgPda2] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("message"),
          roomPda.toBuffer(),
          authority.publicKey.toBuffer(),
          ts2.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      await program.methods
        .sendMessage(ct1, ts1)
        .accountsPartial({
          sender: authority.publicKey,
          room: roomPda,
          member: memberPda,
          message: msgPda1,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .sendMessage(ct2, ts2)
        .accountsPartial({
          sender: authority.publicKey,
          room: roomPda,
          member: memberPda,
          message: msgPda2,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const msg1 = await program.account.message.fetch(msgPda1);
      const msg2 = await program.account.message.fetch(msgPda2);
      expect(Buffer.from(msg1.ciphertext).toString("utf8")).to.equal(
        "message-one"
      );
      expect(Buffer.from(msg2.ciphertext).toString("utf8")).to.equal(
        "message-two"
      );
    });
  });
});
