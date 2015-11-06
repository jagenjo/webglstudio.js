var NotifyModule = {
	init: function()
	{
		LiteGUI.addCSS(".notify-msg { position: absolute; opacity: 0; color: #9AB; margin: 2px; margin-left: 6px; transform: scale(2) translate(0, -100px); transition: all ease-in-out 0.2s; }" + 
			".notify-msg .content { position: relative; color: #EEE; white-space: nowrap; opacity: 0.9; background-color: rgba(80,80,80,0.4); border-left: 4px solid rgba(100,100,100,0.4); display: inline-block; overflow: hidden; padding: 4px; min-width: 100px; min-height: 20px; margin: 2px; padding: 2px; padding-left: 10px; transition: background-color 0.5s; }" +
			".notify-msg .close { width: 20px; height: 20px; pointer-events: auto; position: absolute; left: -20px; top: 2px; cursor: pointer; background-color: #333; }" +
			".notify-msg .close .cross { display: block; transform: translate(8px,12px) rotate(45deg) scale(2); opacity: 0.5; }"  +
			".notify-msg .progress { pointer-events: none; width: 100%; height: 2px; position: absolute; bottom: 2px; left: 0; opacity: 0.5; background-color: #3FA; display: inline-block; transition: all ease-in-out 0.2s; }"  +
			".notify-msg.footer { bottom: 100px; top: auto; }" 
			);

		if(0)
		{
			var test_msg = this.sendMessage("Application launched",0);
			this.sendMessage("+ Pipeline ready");
			this.sendMessage("+ Server ready",4000);
			this.sendMessage("+ Canvas ready",6000);
			this.sendMessage("All system at max power",10000);
		}
	},

	show: function( text, options )
	{
		options = options || {};

		var time = options.time !== undefined ? options.time : 3000;

		var msg = document.createElement("div");
		msg.className = "notify-msg";
		if(options.id)
			msg.id = options.id;
		if(options.className)
			msg.className += " " + options.className;

		msg.innerHTML = "<span class='content' style='"+ (options.style || "")+"'>" + text + "</span>";
		var root = options.parent || LiteGUI.root;
		if(root && root.constructor === String)
			root = document.querySelector( root );
		if(!root)
		{
			console.warn("Notify: error, parent not found", options.parent);
			return;
		}

		var others = root.querySelectorAll(".notify-msg");
		var num = others.length;

		root.appendChild( msg );

		msg.style.top = "calc( " + (options.top !== undefined ? ( options.top.constructor === String ?  options.left : options.left + "px" ) : "20px") + " + " + (num * 24) + "px )";
		msg.style.left = options.left !== undefined ? ( options.left.constructor === String ?  options.left : options.left + "px" ) : "20px";
		setTimeout(function(){ 
			msg.style.opacity = "1"; 
			msg.style.transform = "scale(1)";
		},100);
		msg.content = msg.querySelector(".content");

		if(options.closable) 
		{
			var close = document.createElement("span");
			close.className = "close";
			close.innerHTML = "<span class='cross'>+</span>";
			close.addEventListener("click", function(){
				msg.kill();
			});
			msg.insertBefore(close, msg.childNodes[0] );
		}

		msg.setContent = function(v)
		{
			this.content.innerHTML = v;
		}

		msg.setProgress = function( v, color )
		{
			if(!this.progress)
			{
				this.progress = document.createElement("span");
				this.progress.className = "progress";
				this.appendChild( this.progress );
			}
			if(color)
				this.progress.style.backgroundColor = color;
			this.progress.style.width = (v * 100).toFixed(0) + "%";
		}

		msg.kill = function( delay )
		{
			delay = delay || 0;
			setTimeout(function(){
				msg.style.opacity = "0";
				setTimeout(function(){
					if(msg.parentNode)
						msg.parentNode.removeChild( msg );

					//rearrange all messages
					var others = root.querySelectorAll(".notify-msg");
					for(var i = 0; i < others.length; i++)
						others[i].style.top = "calc( " + (options.top !== undefined ? ( options.top.constructor === String ?  options.left : options.left + "px" ) : "20px") + " + " + (i * 24) + "px )";
				},200);
			},delay);
		}

		if(time)
			setTimeout( function() { 
				msg.kill();
			}, time );

		return msg;
	},

	get: function( id, parent )
	{
		var elem = document.getElementById( id );
		if(!elem || !elem.classList.contains("notify-msg"))
			return null;
		return elem;
	}
};

CORE.registerModule( NotifyModule );