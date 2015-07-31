var fpsCounter = {
	show_counter: false,
	show_stats: false,
	max_samples: 100,
	last_fps: 0,
	show_on_console: false,
	
	buffer: [],

	init: function()
	{
		LiteGUI.menubar.add("View/FPS Counter", {  instance: fpsCounter , property: "show_counter", type:"checkbox", callback: fpsCounter.onEnableFPS });
		LiteGUI.menubar.add("View/Render Stats", {  instance: fpsCounter , property: "show_stats", type:"checkbox", callback: fpsCounter.onEnableStats });
		LEvent.bind(Scene, "afterRender", fpsCounter.frameRendered.bind(this) );
	},

	onEnableFPS: function(v)
	{
		if(fpsCounter.show_counter)
		{
			if(!fpsCounter.canvas)
				fpsCounter.createGraph();
			fpsCounter.canvas.style.display = "block";
		}
		else
		{
			if(fpsCounter.canvas)
				fpsCounter.canvas.style.display = "none";
		}
	},

	onEnableStats: function(v)
	{
		if(fpsCounter.show_stats)
		{
			if(!fpsCounter.stats)
				fpsCounter.createStats();
			fpsCounter.stats.style.display = "block";
		}
		else
		{
			if(fpsCounter.stats)
				fpsCounter.stats.style.display = "none";
		}
	},	

	createGraph: function()
	{
		var canvas = createCanvas(this.max_samples + 20,80);
		canvas.style.position = "absolute";
		canvas.style.left = "10px";
		canvas.style.bottom = "10px";
		this.canvas = canvas;
		var root = document.getElementById("visor");
		if(root)
			root.appendChild(canvas);
		this.updateGraph();
	},

	createStats: function()
	{

		var stats = document.createElement("div");
		this.stats = stats;
		var root = document.getElementById("visor");
		if(root)
			root.appendChild(stats);
		stats.className = "stats-info";
		stats.style.position = "absolute";
		stats.style.left = "150px";
		stats.style.bottom = "10px";
	},

	updateGraph: function()
	{
		if(!this.canvas) return;
		var ctx = this.canvas.getContext("2d");
		ctx.clearRect(0,0,this.canvas.width, this.canvas.height );
		ctx.fillStyle = "rgba(0,0,0,0.5)";
		ctx.fillRect(0,0,this.canvas.width, this.canvas.height );
		if(!this.buffer.length) return;

		ctx.lineWidth = 1;

		ctx.strokeStyle = "rgba(255,255,255,0.4)";
		ctx.beginPath();
		ctx.moveTo(10.5, 10.5 );
		ctx.lineTo(this.canvas.width - 20.5, 10.5 );
		ctx.moveTo(10.5, this.canvas.height - 10.5 );
		ctx.lineTo(this.canvas.width - 20.5, this.canvas.height - 10.5 );
		ctx.stroke();

		for(var i = 0; i < this.buffer.length; i++)
		{
			var v = this.buffer[i];
			ctx.strokeStyle = v > 50 ? "#8F8" : ( v > 30 ? "#AD5" : (v > 20 ? "orange" : "red") );
			ctx.beginPath();
			ctx.moveTo(i + 10.5, this.canvas.height - 10.5 );
			ctx.lineTo(i + 10.5, this.canvas.height - 10.5 - Math.round(v) );
			ctx.stroke();
		}

		ctx.fillStyle = "white";
		ctx.strokeStyle = "black";
		ctx.font = "18px Arial";
		ctx.lineWidth = 2;
		ctx.strokeText( this.last_fps , this.canvas.width * 0.5 - 10, this.canvas.height - 10 );
		ctx.fillText( this.last_fps , this.canvas.width * 0.5 - 10, this.canvas.height - 10 );
	},

	updateStats: function()
	{
		if(!this.stats) return;
		this.stats.innerHTML = "RIs: <span class='important'>" + Renderer._visible_instances.length + "</span> Visible: <span class='important'>" + Renderer._rendered_instances + "</span> DrawCalls: <span class='important'>" + Renderer._rendercalls + "</span>";
	},

	last_time: 0,
	frames: 0,

	frameRendered: function()
	{
		if(!this.show_counter && !this.show_stats)
			return;

		var now = new Date().getTime();
		var elapsed = now - this.last_time;

		if(this.show_stats)
			this.updateStats();

		this.frames++;

		if(elapsed > 1000)
		{
			this.last_fps = this.frames;
			this.buffer.push( this.last_fps );
			this.frames = 0;
			if(this.show_on_console) trace("FPS: " + this.last_fps );
			if(this.buffer.length > 100)
				this.buffer.shift();
			this.last_time = now;
			if(this.show_counter)
				this.updateGraph();
		}
	},
};

LiteGUI.registerModule( fpsCounter );