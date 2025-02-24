

class ProgressBar {
	constructor(elem) {
		this.elem = elem;
	}

	setValue(val) {
		const blocks = this.elem.querySelectorAll(':scope > .block-meter');
		const maxBlock = Math.floor(val * (blocks.length+1));
		for(let b = 0; b < blocks.length; ++b) {
			const opacity = b >= maxBlock ? 0 : 1;
			blocks[b].style.opacity = opacity;
			if(b == maxBlock) {
				blocks[b].classList.add('flash');
			} else {
				blocks[b].classList.remove('flash');
			}
		}
	}

	show(b) {
		this.elem.style.display = b ? 'grid': 'none';
	}
}


class OverrideConnectionProgress {
	constructor(conn) {
		this.conn = conn;
		this.total = 0;
		this.upto = 0;
		this.init(conn);
		this.nextSendProgress = null;
	}

	onProgress(upto, total) {
	}

	sendProgress(upto, total) {
		const now = new Date().getTime();
		if(this.nextSendProgress === null || now >= this.nextSendProgress || upto >= (total-1)) {
			this.conn.send({type:'progress', upto, total});
			this.nextSendProgress = now + (50);
		}
		this.onProgress(upto,total);
	}

	init(conn) {
		const t=this;
		if (conn.dataChannel && conn.dataChannel.onmessageOrig) {
			// already setup
			return;
		}

		conn.dataChannel.onmessageOrig = conn.dataChannel.onmessage;
		conn.dataChannel.onmessage = function() {
			try {
				let k =Object.keys(conn._chunkedData)[0];
				if(k !== undefined) {
					const chunkedData = conn._chunkedData[k];
					t.sendProgress( chunkedData.count, chunkedData.total);
				}
			} catch(e) {
				console.error('onmessage error',e);
			}
			return this.onmessageOrig.apply(this, arguments);
		}
	}
}

class DropNPaste {
	constructor() {
		// settings
		this.reconnectPeerMaxWait = (60000*1);
		this.pasteAreaTimeoutWait = 2000; // millisecs to wait before uploading changes to

		// init
		this.peer = null;
		this.conn = null;
		this.sendMode = false;
		this.reconnectCount = 0;
		this.reconnectPeerTimeout = null;
		this.reconnectPeerTimeoutWait = 500;
		this.pasteAreaTimeout = null;
		this.lastPasteAreaValue = '';
		this.fileList = [];
		this.fileListUpto = 0;
	}

	async setSendMode() {
		document.body.classList.add('send-mode');
		document.body.classList.remove('recv-mode');
		this.sendMode = true;
		this.initPeer(await this.getThisId());
	}

	setRecvMode() {
		document.body.classList.remove('send-mode');
		document.body.classList.add('recv-mode');
		this.sendMode = false;
	}

	initButtons() {
		const sendButton=document.getElementById('send');
		const recvButton=document.getElementById('recv');
		sendButton.addEventListener('click', () => this.setSendMode());
		recvButton.addEventListener('click', () => this.setRecvMode());
		this.peerIdInput.addEventListener('change',async () => {
			this.initPeer(await this.getThisId());
		});
		this.thisIdInput.addEventListener('change',async () => {
			const id = this.thisIdInput.value.trim();
			this.initPeer(id);
			// user has changed the name, let's keep it
			this.changeThisId(id);
			localStorage.setItem('thisIdIsRandom', false);
		});
	}

	async init() {
		this.searchParams = new URLSearchParams(location.search.substring(1));

		this.peerIdInput=document.getElementById('peerid');
		this.thisIdInput=document.getElementById('thisid');
		this.messagesDiv=document.getElementById('messages');
		const peerId = this.getPeerId();
		if(peerId !== null) {
			this.peerIdInput.value = peerId;
		}

		this.initButtons();
		this.initDropArea();
		this.initFileSelector();
		this.initPeer(await this.getThisId());

		if(this.searchParams.get('peerid') !== null || this.searchParams.get('send') !== null) {
			this.setSendMode();
		} else {
			this.setRecvMode();
		}
	}

	initProgressBar(conn) {
		if(!this.progressBar)
			this.progressBar = new ProgressBar(document.getElementById('progress-bar'));
		this.overrideConnectionProgress = new OverrideConnectionProgress(conn);
		this.overrideConnectionProgress.onProgress = (upto, total) => {
			this.progressBar.show(true);
			this.progressBar.setValue(upto / total);
		};
	}

	sendPasteArea() {
		if(this.lastPasteAreaValue == this.pasteArea.value) {
			console.log('Not sending, text has not changed');
			return;
		}
		if (!this.conn) {
			this.addMessage(`No connection to send to`,'error');
			return;
		}
		this.conn.send({type:'text', value:this.pasteArea.value});
		this.lastPasteAreaValue = this.pasteArea.value;
	}

	changePasteArea() {
		if (this.pasteAreaTimeout) {
			clearTimeout(this.pasteAreaTimeout);
		}
		this.pasteAreaTimeout = setTimeout(() => {
			this.sendPasteArea();
		},this.pasteAreaTimeoutWait);
	}

	initPasteArea(elem) {
		this.pasteArea=elem;
		this.pasteArea.addEventListener('keypress', () => this.changePasteArea());
		this.pasteArea.addEventListener('click', () => this.changePasteArea());
		this.pasteArea.addEventListener('change', () => this.changePasteArea());
	}

	getCurrentHMS() {
		const now = new Date();
		const hours = String(now.getHours()).padStart(2, '0');
		const minutes = String(now.getMinutes()).padStart(2, '0');
		const seconds = String(now.getSeconds()).padStart(2, '0');
		return `${hours}:${minutes}:${seconds}`;
	}

	addMessage(html, cls) {
		const hms = this.getCurrentHMS();
		if(this.lastAddMessage == html) {
			const firstMessage = this.messagesDiv.children[0];
			if(firstMessage) {
				const hms = firstMessage.querySelector('.hms');
				hms.innerHTML = hms;
			}
			return;
		}
		this.lastAddMessage = html;

		const newMessage = document.createElement('p');
		newMessage.innerHTML = `<span class='hms'>${hms}</span> <span>${html}</span>`;
		if(cls)
			newMessage.className = cls;
		this.messagesDiv.insertBefore(newMessage, this.messagesDiv.children[0]);
		console.log(html);
	}

	getId(input, name) {
		let id = input.value.trim();
		if(id == "") {
			id = this.searchParams.get(name);
			if(id === null) {
				id = localStorage.getItem(name);
			}
			if(id !== null) {
				input.value = id;
			}
		}
		return id;
	}

	getRandomName() {
		try {
			const url = 'https://random-word-api.herokuapp.com/word?number=2';
			return fetch(url).then((response) => {
				if (!response.ok) {
					throw new Error(`Response status: ${response.status}`);
				}
				return response.json();
			}).then((json) => {
				function cap(s) {
					return s.substring(0,1).toUpperCase()+s.substring(1);
				}
				return cap(json[0])+cap(json[1]);
			});
		} catch (error) {
			console.error(error.message);
		}
		return null;
	}

	getThisId() {
		let oldId = this.thisIdInput.value.trim();
		let id = this.getId(this.thisIdInput, 'thisid');
		if (id == "" || id === null) {
			return this.getRandomName().then((id) => {
				if(id !== null) {
					this.changeThisId(id);
					localStorage.setItem('thisIdIsRandom', true);
					return id;
				}
			});
		} else {
			if(localStorage.getItem('thisid') === null)
				localStorage.setItem('thisid', id);
		}
		if(oldId != id) {
			this.changeThisId(id, true);
		}
		return id;
	}

	changeThisId(id, force) {
		if(localStorage.getItem('thisid') === null)
			localStorage.setItem('thisid', id);
		if(force || this.thisIdInput.value != id) {
			this.thisIdInput.value = id;

			const url = `${location.protocol}//${location.host}${location.pathname}?peerid=${id}`;

			if(this.qrcode) {
				qrcode.clear(); // clear the code.
				qrcode.makeCode(url);
			} else {
				document.getElementById('qrcode-container').style.display='';
				const qrcodeDiv = document.getElementById('qrcode');
				const qrcodeLink = document.getElementById('qrcode-link');
				this.qrcode = new QRCode(qrcodeDiv, {
					text: url,
					colorDark : "#000000",
					colorLight : "#ffffff",
					correctLevel : QRCode.CorrectLevel.H
				});
				qrcodeLink.href = url;
				qrcodeLink.innerHTML = url;
			}
		}
	}

	getPeerId() {
		return this.getId(this.peerIdInput, 'peerid');
	}

	setConnection(conn) {
		this.conn = conn;
	}

	onPeerOpen() {
		if(this.sendMode) {
			const peerId = this.getPeerId();
			this.setConnection( this.peer.connect(peerId, {}) );
			if(!this.conn) {
				console.error('connection failed');
				return;
			}
			if(this.conn)
				this.initProgressBar(this.conn);
			// on open will be launch when you successfully connect to PeerServer
			this.conn.on('connection', () => {
				console.log('send connection');
			});
			this.conn.on('data', (data) => {
				if(data.type == 'progress') {
					this.progressBar.show(true);
					this.progressBar.setValue(data.upto / data.total);
				} else if(data.type == 'received') {
					this.addMessage(`Sent: ${data.filename}`, '');
					this.nextFile();
				}
			});
			this.conn.on('open', () => {
				// here you have conn.id
				this.addMessage(`Connected to: ${peerId}`, '');
				this.reconnectPeerTimeoutWait = 500;
				this.sendFile();
			});
			this.conn.on('error', (err) => {
				this.addMessage(`Connection error: ${err}`, 'error');
				this.reconnectPeer();
			});
		}
	}

	reconnectPeer() {
		if(this.reconnectPeerTimeout)
			return;
		this.reconnectPeerTimeout = setTimeout(async () => {
			if(this.peer.disconnected) {
				this.initPeer(await this.getThisId());
			} else {
				this.onPeerOpen();
			}

			if(this.reconnectPeerTimeoutWait < this.reconnectPeerMaxWait) {
				this.reconnectPeerTimeoutWait *= 1.5;
			}
			this.reconnectPeerTimeout = null;
		}, (Math.random()*this.reconnectPeerTimeoutWait) + this.reconnectPeerTimeoutWait);
	}

	showNextImage() {
		const currentShown = this.recvImg.querySelector(':scope > img.show-img');
		let prevImg = null;
		if(currentShown) {
			currentShown.classList.remove('show-img');
			prevImg = currentShown.previousSibling;
		}
		if(!prevImg) {
			const imgs = this.recvImg.querySelectorAll(':scope > img');
			prevImg = imgs[imgs.length-1];
		}
		if(prevImg) {
			prevImg.classList.add('show-img');
		}
	}

	addImage(url) {
		if(!this.recvImg) {
			this.recvImg = document.getElementById('recv-img');
			this.recvImg.addEventListener('click',() => this.showNextImage());
			this.recvImg.addEventListener('keypress',() => this.showNextImage());
		}

		const currentShowns = this.recvImg.querySelectorAll(':scope > img.show-img');
		for(let showImg of currentShowns) {
			showImg.classList.remove('show-img');
		}
		const img = document.createElement('img');
		img.src = url;
		img.classList.add('show-img');
		this.recvImg.appendChild(img);
	}

	// connection opened from sender on receiver. Save file
	onConnOpen(conn) {
		this.setConnection(conn);
		this.addMessage(`Connected to: ${conn.peer}`);
		this.conn.on('data', (data) => {
			if(data.type == 'startoflist') {
				return;
			}
			if(data.type == 'endoflist') {
				this.progressBar.show(false);
				return;
			}
			if(data.type == 'received') {
				return;
			}
			document.getElementById('instructions').style.display='none';
			if(data.type == 'text') {
				const recvText = document.getElementById('recv-text');
				recvText.innerHTML = data.value;
				if(data.value != "") {
					recvText.classList.add('has-text');
				} else {
					recvText.classList.remove('has-text');
				}
				return;
			}

			this.addMessage(`Downloaded: ${data.filename}`, '');
			var file = new Blob([data.array], {type: "application/octet-stream"});

			if(/\.(png|jpg|gif|avif|webp|svg|bmp)$/i.exec(data.filename)) {
				const url = URL.createObjectURL(file);
				this.addImage(url);
			}

			var a = document.createElement("a"), url = URL.createObjectURL(file);
			a.href = url;
			a.download = data.filename;
			document.body.appendChild(a);
			a.click();
			this.conn.send({type:'received', filename:data.filename});
		});
		this.conn.on('close', () => {
			console.log('connection closed');
		});
		this.conn.on('open', () => {
			console.log('connection opened');
			if(this.conn)
				this.initProgressBar(this.conn);
		});
		this.conn.on('error', (err) => {
			this.addMessage(`connection error: ${err}`,'error');
		});
	}

	initPeer(id) {
		if(this.peer) {
			this.peer.destroy();
		}
		this.peer = new Peer(id, {debug:this.searchParams.get('debug') || 2} );
		this.peer.on('open', () => {
			this.onPeerOpen();
		});

		this.peer.on('connection', (conn) => {
			this.onConnOpen(conn);
			this.reconnectCount = 0;
		});
		this.peer.on('error', (err) => {
			this.addMessage(`peer error: ${err} ${err.type}`, 'error');
			const reconnectTypes = {
				network:true,
				'server-error':true,
				'socket-error':true,
				'socket-closed':true,
				'peer-unavailable':true,
				'network':true,
			};
			if(err.type == 'unavailable-id') {
				this.addMessage('Is more than one tab opened? Please use a private tab if you wish to open more than one tab. Or pick a new name.', 'error');
				return;
			}
			if(reconnectTypes[err.type]) {
				this.reconnectPeer();
			}
		});
		this.peer.on('close', () => {
			console.log(`Closed from ${id}`,this.peer);
			// this.reconnect();
		});
		this.peer.on('disconnected', () => {
			console.log(`Disconnected from ${id}`,this.peer);
			this.reconnect();
		});
	}

	reconnect() {
		setTimeout(() => {
			if(!this.peer.destroyed && this.reconenctCount < 5) {
				this.peer.reconnect();
				++this.reconnectCount;
			}
		}, Math.random()*2000);
	}

	initFileSelector() {
		const fileSelector = document.getElementById('file-selector');
		fileSelector.addEventListener('change', (event) => {
			const fileList = event.target.files;
			this.uploadFileList(fileList);
		});
	}

	uploadFileList(fileList) {
		this.fileList = fileList;
		this.fileListUpto = 0;
		this.progressBar.show(true);
		this.sendFile();
	}

	nextFile() {
		++this.fileListUpto;
		this.sendFile();
	}

	sendFile() {
		const file = this.fileList[this.fileListUpto];
		if(!file) {
			if(this.fileList.length >= 3 ) {
				this.addMessage(`${this.fileList.length} files done.`, '');
			}
			this.progressBar.show(false);
			this.conn.send({type:'endoflist', length:this.fileList.length});
			this.fileList = null;
			return;
		}
		this.readFile(file);
	}

	readFile(file) {
		const reader = new FileReader();
		reader.addEventListener('load', (event) => {
			this.addMessage(`Sending: ${file.name}`, '');
			this.conn.send({type:'file', array:event.target.result, filename:file.name});
		});
		reader.readAsArrayBuffer(file);
	}

	initDropArea() {
		const dropArea = document.getElementById('drop-area');

		dropArea.addEventListener('dragover', (event) => {
			event.stopPropagation();
			event.preventDefault();
			// Style the drag-and-drop as a "copy file" operation.
			event.dataTransfer.dropEffect = 'copy';
		});

		dropArea.addEventListener('drop', (event) => {
			event.stopPropagation();
			event.preventDefault();
			const fileList = event.dataTransfer.files;
			this.uploadFileList(fileList);
		});
		this.initPasteArea(dropArea);
	}
}

const dropNPaste = new DropNPaste();
dropNPaste.init();
