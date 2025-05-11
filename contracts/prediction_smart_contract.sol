// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface ISapphire {
    function publicKey() external view returns (bytes memory);
    function decrypt(bytes calldata ciphertext, bytes calldata associatedData) external view returns (bytes memory);
}

contract PredictionMarket {
    ISapphire public immutable sapphire;
    address public immutable oracle;
    bool public isResolved;
    bool public outcome;
    uint256 public totalPool;
    uint256 public totalWinningBets;
    
    struct Bet {
        bytes encryptedChoice;
        uint256 amount;
        bool decryptedChoice;
        bool isWinner;
    }
    
    mapping(address => Bet) public bets;
    address[] public participants;

    event BetPlaced(address indexed user, uint256 amount);
    event Resolved(bool outcome);
    event Payout(address indexed user, uint256 amount);

    modifier onlyOracle() {
        require(msg.sender == oracle, "Not oracle");
        _;
    }

    constructor(address _oracle, address _sapphire) {
        oracle = _oracle;
        sapphire = ISapphire(_sapphire);
    }

    function placeBet(bytes calldata encryptedChoice) external payable {
        require(!isResolved, "Market resolved");
        require(msg.value > 0, "Invalid bet amount");
        
        bets[msg.sender] = Bet({
            encryptedChoice: encryptedChoice,
            amount: msg.value,
            decryptedChoice: false,
            isWinner: false
        });
        participants.push(msg.sender);
        totalPool += msg.value;
        
        emit BetPlaced(msg.sender, msg.value);
    }

    function resolve(bool _outcome) external onlyOracle {
        require(!isResolved, "Already resolved");
        outcome = _outcome;
        isResolved = true;
        
        _decryptAndCalculateWinners();
        _distributePayouts();
        
        emit Resolved(_outcome);
    }

    function _decryptAndCalculateWinners() private {
        totalWinningBets = 0;
        
        for (uint256 i = 0; i < participants.length; i++) {
            address user = participants[i];
            Bet storage bet = bets[user];
            
            bytes memory decrypted = sapphire.decrypt(bet.encryptedChoice, "");
            bool choice = abi.decode(decrypted, (bool));
            
            bet.decryptedChoice = choice;
            if (choice == outcome) {
                bet.isWinner = true;
                totalWinningBets += bet.amount;
            }
        }
    }

    function _distributePayouts() private {
        require(totalWinningBets > 0, "No winners");
        
        for (uint256 i = 0; i < participants.length; i++) {
            address user = participants[i];
            Bet storage bet = bets[user];
            
            if (bet.isWinner) {
                uint256 payout = (bet.amount * totalPool) / totalWinningBets;
                payable(user).transfer(payout);
                emit Payout(user, payout);
            }
        }
    }

    function getPublicKey() external view returns (bytes memory) {
        return sapphire.publicKey();
    }

    function getOracleAddress() external view returns (address) {
        return oracle;
    }
}
