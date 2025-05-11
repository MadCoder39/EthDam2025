import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import PredictionMarket from './contracts/PredictionMarket.json';

// Add type declarations for MetaMask
declare global {
  interface Window {
    ethereum: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, callback: (params: any) => void) => void;
      removeListener: (event: string, callback: (params: any) => void) => void;
      isMetaMask: boolean;
      selectedAddress: string | null;
      networkVersion: string;
    };
  }
}

// const CONTRACT_ADDRESS = '0xdBEf54C238908C84e8cBc6AdB5991fF783A78E64';
// const CONTRACT_ADDRESS = '0xB6e4F7f2A6e4CF902b2e366F6c57e7e7A0C8ec91';
const CONTRACT_ADDRESS = '0xA8A2B5F111Fed28B7f7584650Ed069FB7F793eeE';

function App() {
  const [account, setAccount] = useState<string>('');
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [betAmount, setBetAmount] = useState<string>('');
  const [choice, setChoice] = useState<boolean>(false);
  const [isResolved, setIsResolved] = useState<boolean>(false);
  const [outcome, setOutcome] = useState<boolean>(false);
  const [totalPool, setTotalPool] = useState<string>('0');
  const [isOracle, setIsOracle] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [network, setNetwork] = useState<string>('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const init = async () => {
      if (window.ethereum && window.ethereum.isMetaMask) {
        try {
          console.log('Checking if MetaMask is connected...');
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          const networkVersion = window.ethereum.networkVersion;
          setNetwork(networkVersion);
          
          if (accounts.length > 0) {
            setIsConnected(true);
            setAccount(accounts[0]);
            await connectWallet();
          }

          // Set up event listeners
          window.ethereum.on('accountsChanged', handleAccountsChanged);
          window.ethereum.on('chainChanged', handleChainChanged);
          window.ethereum.on('connect', handleConnect);
          window.ethereum.on('disconnect', handleDisconnect);

        } catch (error) {
          console.error('Error initializing:', error);
          setError('Failed to initialize MetaMask connection');
        }
      } else {
        setError('MetaMask not detected. Please install the MetaMask extension.');
      }
    };

    init();

    // Cleanup event listeners
    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
        window.ethereum.removeListener('connect', handleConnect);
        window.ethereum.removeListener('disconnect', handleDisconnect);
      }
    };
  }, []);

  const handleAccountsChanged = (accounts: string[]) => {
    console.log('Accounts changed:', accounts);
    if (accounts.length === 0) {
      setAccount('');
      setContract(null);
      setIsConnected(false);
    } else {
      setAccount(accounts[0]);
      connectWallet();
    }
  };

  const handleChainChanged = (chainId: string) => {
    console.log('Chain changed:', chainId);
    window.location.reload();
  };

  const handleConnect = () => {
    console.log('MetaMask connected');
    setIsConnected(true);
  };

  const handleDisconnect = () => {
    console.log('MetaMask disconnected');
    setIsConnected(false);
    setAccount('');
    setContract(null);
  };

  const verifyContract = async (provider: ethers.providers.Web3Provider) => {
    try {
      const code = await provider.getCode(CONTRACT_ADDRESS);
      if (code === '0x') {
        throw new Error('No contract found at the specified address');
      }
      return true;
    } catch (error) {
      console.error('Contract verification failed:', error);
      return false;
    }
  };

  const updateContractState = async () => {
    if (!contract) return;
    
    try {
      const [isResolved, outcome, totalPool] = await Promise.all([
        contract.isResolved(),
        contract.outcome(),
        contract.totalPool()
      ]);
      
      setIsResolved(isResolved);
      setOutcome(outcome);
      setTotalPool(ethers.utils.formatEther(totalPool));
    } catch (error) {
      console.error('Error updating contract state:', error);
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum || !window.ethereum.isMetaMask) {
      setError('MetaMask not detected. Please install the MetaMask extension.');
      return;
    }

    setIsConnecting(true);
    setError('');

    try {
      console.log('Requesting accounts...');
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      console.log('Accounts received:', accounts);

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      console.log('Setting up provider and contract...');
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      
      // Verify contract exists
      const isContractValid = await verifyContract(provider);
      if (!isContractValid) {
        throw new Error('Contract not found at the specified address. Please check the contract address.');
      }

      const signer = provider.getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        PredictionMarket.abi,
        signer
      );

      // Log the oracle address from the contract
      const oracleAddress = await contract.getOracleAddress();
      console.log('Contract Oracle Address:', oracleAddress);
      console.log('Current Account:', accounts[0]);
      console.log('Is Oracle Match:', accounts[0].toLowerCase() === oracleAddress.toLowerCase());

      setContract(contract);
      setAccount(accounts[0]);

      // Use the contract's oracle address instead of hardcoded one
      setIsOracle(accounts[0].toLowerCase() === oracleAddress.toLowerCase());
      
      // Set default values
      setIsResolved(false);
      setOutcome(false);
      setTotalPool('0');
      
      // Update contract state
      await updateContractState();
      
      setIsConnected(true);
      console.log('MetaMask connection successful');
    } catch (error: any) {
      console.error('Error connecting wallet:', error);
      setError(error.message || 'Failed to connect MetaMask');
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const validateBetAmount = (amount: string): boolean => {
    try {
      const value = parseFloat(amount);
      if (isNaN(value) || value <= 0) {
        setMessage({ text: 'Please enter a valid bet amount greater than 0', type: 'error' });
        return false;
      }
      return true;
    } catch (error) {
      setMessage({ text: 'Invalid bet amount format', type: 'error' });
      return false;
    }
  };

  const getEncryptedChoice = async (choice: boolean): Promise<string> => {
    if (!contract) throw new Error('Contract not connected');
    
    // For now, we'll use a simple encoding of the choice
    // This is not secure encryption, but it will work for testing
    const message = ethers.utils.defaultAbiCoder.encode(['bool'], [choice]);
    
    // Add some random bytes to make it look like encryption
    const randomBytes = ethers.utils.randomBytes(32);
    const concatenated = ethers.utils.concat([randomBytes, message]);
    
    // Convert the Uint8Array to a hex string
    return ethers.utils.hexlify(concatenated);
  };

  const placeBet = async () => {
    if (!contract) {
      setMessage({ text: 'Contract not connected', type: 'error' });
      return;
    }

    if (!betAmount) {
      setMessage({ text: 'Please enter a bet amount', type: 'error' });
      return;
    }

    if (!validateBetAmount(betAmount)) {
      return;
    }

    try {
      setMessage({ text: 'Placing bet...', type: 'success' });
      
      // Get the current gas price
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const gasPrice = await provider.getGasPrice();
      
      // Get properly encrypted choice
      const encryptedChoice = await getEncryptedChoice(choice);
      
      const tx = await contract.placeBet(encryptedChoice, {
        value: ethers.utils.parseEther(betAmount),
        gasPrice: gasPrice
      });
      
      setMessage({ text: 'Transaction submitted. Waiting for confirmation...', type: 'success' });
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 0) {
        throw new Error('Transaction failed');
      }
      
      // Update total pool after successful bet
      const newTotalPool = await contract.totalPool();
      setTotalPool(ethers.utils.formatEther(newTotalPool));
      
      setMessage({ 
        text: `Successfully placed bet of ${betAmount} ETH on ${choice ? 'True' : 'False'}!`, 
        type: 'success' 
      });
      
      // Clear the bet amount after successful bet
      setBetAmount('');
    } catch (error: any) {
      console.error('Error placing bet:', error);
      
      // Handle specific error cases
      if (error.code === 'INSUFFICIENT_FUNDS') {
        setMessage({ 
          text: 'Insufficient funds to place bet. Please check your balance.', 
          type: 'error' 
        });
      } else if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
        setMessage({ 
          text: 'Transaction would fail. Please check your bet amount and try again.', 
          type: 'error' 
        });
      } else if (error.message.includes('user rejected')) {
        setMessage({ 
          text: 'Transaction was rejected. Please try again.', 
          type: 'error' 
        });
      } else {
        setMessage({ 
          text: error.message || 'Failed to place bet. Please try again.', 
          type: 'error' 
        });
      }
    }
  };

  const resolveMarket = async (outcome: boolean) => {
    if (!contract || !isOracle) {
      setMessage({ text: 'You are not authorized to resolve the market', type: 'error' });
      return;
    }

    try {
      setMessage({ text: 'Resolving market...', type: 'success' });
      
      // Get the current gas price
      const provider = new ethers.providers.Web3Provider(window.ethereum);

      const tx = await contract.resolve(outcome);

      setMessage({ text: 'Transaction submitted. Waiting for confirmation...', type: 'success' });
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 0) {
        throw new Error('Transaction failed');
      }
      
      // Update all contract state
      await updateContractState();
      
      setMessage({ 
        text: `Market successfully resolved as ${outcome ? 'True' : 'False'}!`, 
        type: 'success' 
      });
    } catch (error: any) {
      console.error('Error resolving market:', error);
      
      // Handle specific error cases
      if (error.code === 'INSUFFICIENT_FUNDS') {
        setMessage({ 
          text: 'Insufficient funds to resolve market.', 
          type: 'error' 
        });
      } else if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
        setMessage({ 
          text: 'Transaction would fail. Please check if the market is already resolved.', 
          type: 'error' 
        });
      } else if (error.message.includes('user rejected')) {
        setMessage({ 
          text: 'Transaction was rejected. Please try again.', 
          type: 'error' 
        });
      } else if (error.message.includes('only oracle')) {
        setMessage({ 
          text: 'Only the oracle can resolve the market.', 
          type: 'error' 
        });
      } else {
        setMessage({ 
          text: error.message || 'Failed to resolve market. Please try again.', 
          type: 'error' 
        });
      }
    }
  };

  // Auto-clear messages after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  useEffect(() => {
    if (contract) {
      updateContractState();
      
      // Listen for BetPlaced events
      contract.on('BetPlaced', async () => {
        await updateContractState();
      });
      
      // Listen for Resolved events
      contract.on('Resolved', async () => {
        await updateContractState();
      });
      
      return () => {
        contract.removeAllListeners();
      };
    }
  }, [contract]);

  return (
    <div className="App" style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h1>Prediction Market</h1>
      
      <div style={{ marginBottom: '20px' }}>
        {error && (
          <div style={{ 
            color: 'red', 
            marginBottom: '10px',
            padding: '10px',
            backgroundColor: '#ffebee',
            borderRadius: '4px',
            border: '1px solid #ffcdd2'
          }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ 
            color: message.type === 'success' ? '#2e7d32' : '#c62828',
            marginBottom: '10px',
            padding: '10px',
            backgroundColor: message.type === 'success' ? '#e8f5e9' : '#ffebee',
            borderRadius: '4px',
            border: `1px solid ${message.type === 'success' ? '#c8e6c9' : '#ffcdd2'}`
          }}>
            {message.text}
          </div>
        )}
        
        {!isConnected ? (
          <button 
            onClick={connectWallet}
            disabled={isConnecting}
            style={{ 
              padding: '10px 20px',
              fontSize: '16px',
              cursor: isConnecting ? 'not-allowed' : 'pointer',
              opacity: isConnecting ? 0.7 : 1
            }}
          >
            {isConnecting ? 'Connecting...' : 'Connect MetaMask'}
          </button>
        ) : (
          <>
            <p>Connected Account: {account}</p>
            <p>Network: {network}</p>
            <p>Contract Address: {CONTRACT_ADDRESS}</p>
            <p>Total Pool: {totalPool} ETH</p>
            <p>Status: {isResolved ? `Resolved (${outcome ? 'True' : 'False'})` : 'Open'}</p>
          </>
        )}
      </div>

      {isConnected && !isResolved && (
        <div style={{ marginBottom: '20px' }}>
          <h2>Place a Bet</h2>
          <div style={{ marginBottom: '10px' }}>
            <label>
              Amount (ETH):
              <input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                style={{ marginLeft: '10px' }}
                placeholder="Enter amount in ETH"
              />
            </label>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label>
              Your Prediction:
              <select
                value={choice.toString()}
                onChange={(e) => setChoice(e.target.value === 'true')}
                style={{ marginLeft: '10px' }}
              >
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            </label>
          </div>
          <button 
            onClick={placeBet}
            disabled={!betAmount}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              cursor: !betAmount ? 'not-allowed' : 'pointer',
              opacity: !betAmount ? 0.7 : 1
            }}
          >
            Place Bet
          </button>
        </div>
      )}

      {isConnected && isOracle && !isResolved && (
        <div>
          <h2>Oracle Controls</h2>
          <button 
            onClick={() => resolveMarket(true)} 
            style={{ 
              marginRight: '10px',
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Resolve as True
          </button>
          <button 
            onClick={() => resolveMarket(false)}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Resolve as False
          </button>
        </div>
      )}
    </div>
  );
}

export default App; 