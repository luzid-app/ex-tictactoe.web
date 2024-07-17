import * as anchor from '@coral-xyz/anchor'
import * as web3 from '@solana/web3.js'
import { AccountModification, Cluster, LuzidSdk } from '@luzid/sdk'
import { SNAPSHOT_GROUP } from './consts'
import toast, { toastConfig } from 'react-simple-toasts'
import { GameState, TicTacToe } from './types'

toastConfig({ theme: 'dark' })

function isSolanaError(err: any) {
  // If we get this kind of error then we connected to Luzid successfully
  // Otherwise we'd get a transport error
  return err.toString().includes('SolanaSdkTransactionError')
}
export class GameLuzid {
  snapshotCount = 0
  luzid?: LuzidSdk

  constructor(
    readonly conn: web3.Connection,
    readonly gameKeypair: web3.Keypair,
    readonly playerOne: web3.Keypair,
    readonly playerTwo: web3.Keypair
  ) {}

  async getLuzid() {
    if (this.luzid == null) {
      let luzid = new LuzidSdk()
      this.luzid = luzid
      try {
        await luzid.ping.ping()
        this.luzid = luzid
        return luzid
      } catch (err) {
        // Older Luzid's attach at 50051
        let oldLuzid = new LuzidSdk({ client: { port: 50051 } })
        try {
          // Older Luzid's didn't have ping so we need to verify it's online another way
          // This doesn't do anything as we cannot airdrop to the system program
          // However it serves to see if the connectoin is working
          await oldLuzid.rpc.requestAirdrop(
            Cluster.Development,
            web3.SystemProgram.programId.toBase58(),
            1
          )
          this.luzid = oldLuzid
          return oldLuzid
        } catch (err) {
          if (isSolanaError(err)) {
            this.luzid = oldLuzid
            return oldLuzid
          }
        }
      }
      toast('Failed to connect to Luzid')
      throw new Error('Failed to connect to Luzid')
    }
    return this.luzid!
  }

  async takeSnapshot() {
    const luzid = await this.getLuzid()
    return luzid.snapshot.createSnapshot(
      `Snapshot ${this.snapshotCount++}`,
      [
        this.playerOne.publicKey.toBase58(),
        this.playerTwo.publicKey.toBase58(),
        this.gameKeypair.publicKey.toBase58(),
      ],
      {
        description: `Game: TicTacToe (${this.gameKeypair.publicKey.toBase58()})`,
        group: SNAPSHOT_GROUP,
      }
    )
  }

  async restoreLastUpdatedSnapshot() {
    const luzid = await this.getLuzid()
    return luzid.snapshot.restoreAccountsFromLastUpdatedSnapshot({
      deleteSnapshotAfterRestore: true,
      filter: { group: SNAPSHOT_GROUP },
    })
  }

  async modifyGameState(
    program: anchor.Program<TicTacToe>,
    gameState: GameState
  ) {
    const luzid = await this.getLuzid()
    const data = await program.coder.accounts.encode('Game', gameState)
    const gameAccountDef = program.idl.accounts[0]
    const size = program.coder.accounts.size(gameAccountDef)
    return luzid.mutator.modifyAccount(
      AccountModification.forAddr(
        this.gameKeypair.publicKey.toBase58()
      ).setData(data, { size })
    )
  }

  async deleteAppSnapshots() {
    const luzid = await this.getLuzid()
    return luzid.snapshot.deleteSnapshotsMatching({
      group: SNAPSHOT_GROUP,
    })
  }

  async labelTransaction(signature: string, label: string) {
    const luzid = await this.getLuzid()
    return luzid.transaction.labelTransaction(signature, label)
  }
}
