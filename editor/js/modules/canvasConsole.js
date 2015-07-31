var CanvasConsole = {
	init: function()
	{
		LiteGUI.addCSS(".canvas-console .msg { position: relative; color: #9AB; margin: 2px; margin-left: 6px; }" + 
			".canvas-console .msg .content { white-space: nowrap; opacity: 0.5; background-color: rgba(50,50,50,0.4); border-left: 4px solid rgba(100,100,100,0.4); display: inline-block; overflow: hidden; padding: 4px; min-width: 100px; min-height: 20px; margin: 2px; padding: 2px; padding-left: 10px; transition: background-color 0.5s; }" +
			".canvas-console .msg .close { width: 20px; height: 20px; pointer-events: auto; position: absolute; left: -20px; top: 2px; cursor: pointer; background-color: #333; }" +
			".canvas-console .msg .close .cross { display: block; transform: translate(8px,12px) rotate(45deg) scale(2); opacity: 0.5; }" 
			);
		this.createElement();
	},

	createElement: function()
	{
		if(this.root) $(this.root).remove();

		var root = document.createElement("div");
		root.style.position = "absolute";
		root.style.left = "50px";
		root.style.top = "50px";
		root.style.width = "200px";
		root.style.pointerEvents = "none";
		root.className = "canvas-console";
		this.root = root;

		if(0)
		{
			var test_msg = this.sendMessage("Application launched",0);
			this.sendMessage("+ Pipeline ready");
			this.sendMessage("+ Server ready",4000);
			this.sendMessage("+ Canvas ready",6000);
			this.sendMessage("All system at max power",10000);
		}

		document.getElementById("visor").appendChild(root);
	},

	sendMessage: function(text, time, options )
	{
		if(typeof(time) === "object")
		{
			options = time;
			time = options.time;
		}

		options = options || {};

		if(time === undefined)
			time = 3000;
		var msg = document.createElement("div");
		msg.className = "msg";
		if(options.id)
			msg.id = options.id;
		if(options.className)
			msg.className += " " + options.className;

		msg.innerHTML = "<span class='content' style='"+ (options.style || "")+"'>" + text + "</span>";
		this.root.appendChild(msg);
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

		msg.kill = function( delay )
		{
			delay = delay || 0;
			$(this).delay(delay).animate({opacity: 0.01},500, function() { 
				$(this).animate({height: 1}, 200, function() { 
					$(this).remove(); 
				});
			});
		}

		if(time)
			setTimeout( function() { 
				msg.kill();
			}, time );

		return msg;
	}
};

LiteGUI.registerModule( CanvasConsole );