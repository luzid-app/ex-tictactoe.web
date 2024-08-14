import * as anchor from '@coral-xyz/anchor'
import * as web3 from '@solana/web3.js'
import { GameState, TicTacToe } from './types'

export class GameWeb3 {
  constructor(
    readonly program: anchor.Program<TicTacToe>,
    readonly conn: web3.Connection,
    readonly gameKeypair: web3.Keypair,
    readonly playerOne: web3.Keypair,
    readonly playerTwo: web3.Keypair
  ) {}

  async fundAccount(pubkey: web3.PublicKey) {
    const signature = await this.conn.requestAirdrop(
      pubkey,
      web3.LAMPORTS_PER_SOL
    )
    await this.conn.confirmTransaction({
      signature,
      ...(await this.conn.getLatestBlockhash()),
    })
    return signature
  }

  subscribeLamportsChange(
    pubkey: web3.PublicKey,
    onChange: (lamports: number) => void
  ): () => void {
    const subscriptionId = this.conn.onAccountChange(pubkey, async (info) => {
      onChange(info.lamports)
    })

    return () => {
      this.conn.removeAccountChangeListener(subscriptionId)
    }
  }

  subscribeGameState(onChange: (gameState: GameState) => void): () => void {
    const subscriptionId = this.conn.onProgramAccountChange(
      this.program.programId,
      async (info) => {
        if (info.accountId.equals(this.gameKeypair.publicKey)) {
          if (
            info.accountInfo.data !== null &&
            info.accountInfo.data.length > 0
          ) {
            const gameState = this.program.coder.accounts.decode(
              'Game',
              info.accountInfo.data
            ) as GameState
            onChange(gameState)
          }
        }
      }
    )

    return () => {
      this.conn.removeProgramAccountChangeListener(subscriptionId)
    }
  }

  async fetchGameState(): Promise<GameState> {
    return this.program.account.game.fetch(
      this.gameKeypair.publicKey
    ) as Promise<GameState>
  }

  async setupGame() {
    const signature = await this.program.methods
      .setupGame(this.playerTwo.publicKey)
      .accounts({
        game: this.gameKeypair.publicKey,
        playerOne: this.playerOne.publicKey,
      })
      .signers([this.gameKeypair])
      .rpc()

    return { signature }
  }

  async play(
    player: web3.Keypair,
    row: number,
    col: number
  ): Promise<{ signature: string }> {
    const signature = await this.program.methods
      .play({ row, column: col })
      .accounts({
        game: this.gameKeypair.publicKey,
        player: player.publicKey,
      })
      .signers([player])
      .rpc()

    return { signature }
  }

  async getAccountFunds(pubkey: web3.PublicKey) {
    const account = await this.conn.getAccountInfo(pubkey)
    return account?.lamports ?? 0
  }
}
