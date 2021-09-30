import nearApi from "near-api-js";
import {sha256} from "js-sha256";
import {Meteor} from "meteor/meteor";
import {SyncedCron} from 'meteor/littledata:synced-cron';
import {DaoData} from "../imports/api/data";
import {Decimal} from "decimal.js";

export const factory = 'sputnik-dao.near';
export const todayDate = new Date().toISOString().slice(0, 10);

export const NEAR_RPC_URL = 'https://rpc.mainnet.near.org'
const provider = new nearApi.providers.JsonRpcProvider(NEAR_RPC_URL);
const connection = new nearApi.Connection(NEAR_RPC_URL, provider, {});
const account = new nearApi.Account(connection, '');

async function accountExists(accountId) {
  try {
    return await new nearApi.Account(connection, accountId).state();
  } catch (error) {
    return false;
  }
}

async function getDaoList(factory) {
  return await account.viewFunction(factory, 'get_dao_list', {})
}

async function getDaoData(dao) {
  const state = await accountExists(dao);
  if (state) {
    const policy = await account.viewFunction(dao, 'get_policy', {})
    const config = await account.viewFunction(dao, 'get_config', {})
    const stakingContract = await account.viewFunction(dao, 'get_staking_contract', {})
    const availableAmount = await account.viewFunction(dao, 'get_available_amount', {})
    const delegationTotalSupply = await account.viewFunction(dao, 'delegation_total_supply', {})
    const purpose = config.purpose;
    const votePeriod = policy.proposal_period;
    const bond = policy.proposal_bond;

    let council = [];
    for (let role of policy.roles) {
      if (typeof role.kind === 'object') {
        council = council.concat(role.kind.Group);
      }
    }

    council = Array.from(new Set(council));


    let limit = 100;
    let fromIndex = 0;
    let numberProposals = await account.viewFunction(dao, 'get_last_proposal_id', {})
    console.log(dao + ": " + numberProposals);
    let proposals = [];

    if (numberProposals > 100) {
      let pages = new Decimal(numberProposals / limit).toFixed(0);
      let i;
      for (i = 0; i <= pages; i++) {
        fromIndex = limit * i;
        let proposals2;
        try {
          proposals2 = await account.viewFunction(dao, 'get_proposals', {from_index: fromIndex, limit: limit})
        } catch (e) {
          console.log(e)
        }
        Array.prototype.push.apply(proposals, proposals2);
      }
    } else {
      proposals = await account.viewFunction(dao, 'get_proposals', {from_index: fromIndex, limit: limit})
    }

    proposals.forEach(function (v) {
      delete v.votes;
    });

    return {
      council: council,
      purpose: purpose,
      proposals: proposals,
      votePeriod: votePeriod,
      bond: bond,
      amount: state.amount,
    }
  } else {
    return false;
  }
}


async function storeDaoList() {
  const daos = await getDaoList(factory);
  let stop = false
  console.log('total daos: ' + daos.length);
  for (const item of daos) {
    if (!stop) {
      const dao = await getDaoData(item);
      //stop = true;

      if (dao) {
        try {
          DaoData.update(
            {
              daoName: item,
            },
            {
              daoName: item,
              council: dao.council,
              purpose: dao.purpose,
              proposals: dao.proposals,
              votePeriod: dao.votePeriod,
              bond: dao.bond,
              amount: dao.amount,
            },
            {upsert: true}
          )
        } catch (e) {
          console.log(dao);
          console.log(e);
        }
      }

    }
  }
}

/*
storeDaoList().then().catch((e) => {
  console.log(e)
})
*/

if (Meteor.isServer) {
  SyncedCron.add({
    name: 'Fetch Dao Data',
    schedule: function (parser) {
      return parser.text('every 12 minutes');
    },
    job: async function () {
      await storeDaoList()
    }
  });
}
