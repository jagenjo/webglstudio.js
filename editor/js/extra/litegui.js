//packer version

/**
* Core namespace of LiteGUI library, it holds some useful functions
*
* @class LiteGUI
* @constructor
*/


var LiteGUI = {
	root: null,
	content: null,

	panels: {},
	windows: [], //windows opened by the GUI (we need to know about them to close them once the app closes)

	//undo
	undo_steps: [],

	//used for blacken when a modal dialog is shown
	modalbg_div: null,

	//the top menu
	mainmenu: null,

	/**
	* initializes the lib, must be called
	* @method init
	* @param {object} options some options are container, menubar, 
	*/
	init: function(options)
	{
		options = options || {};

		if(options.width && options.height)
			this.setWindowSize(options.width,options.height);

		//choose main container
		this.container = null;
		if( options.container )
			this.container = document.getElementById(options.container);
		if(!this.container )
			this.container = document.body;

		if( options.wrapped )
		{
			//create litegui root element
			var root = document.createElement("div");
			root.style.position = "relative";
			root.style.overflow = "hidden";
			this.root = root;
			this.container.appendChild( root );

			//content: the main container for everything
			var content = document.createElement("div");
			this.content = content;
			this.root.appendChild(content);

			//maximize
			if( this.root.classList.contains("fullscreen") )
			{
				window.addEventListener("resize", function(e) { 
					LiteGUI.maximizeWindow();
				});
			}
		}
		else
			this.root = this.content = this.container;

		this.root.className = "litegui-wrap fullscreen";
		this.content.className = "litegui-maincontent";

		//create modal dialogs container
		var modalbg = this.modalbg_div = document.createElement("div");
		this.modalbg_div.className = "litemodalbg";
		this.root.appendChild(this.modalbg_div);
		modalbg.style.display = "none";

		//create menubar
		if(options.menubar)
			this.createMenubar();

		//called before anything
		if(options.gui_callback)
			options.gui_callback();

		//external windows
		window.addEventListener("beforeunload", function(e) {
			for(var i in LiteGUI.windows)
				LiteGUI.windows[i].close();
			LiteGUI.windows = [];
		});
	},

	/**
	* Triggers a simple event in an object (similar to jQuery.trigger)
	* @method trigger
	* @param {Object} element could be an HTMLEntity or a regular object
	* @param {String} event_name the type of the event
	* @param {*} params it will be stored in e.detail
	* @param {*} origin it will be stored in e.srcElement
	*/
	trigger: function(element, event_name, params, origin)
	{
		var evt = document.createEvent( 'CustomEvent' );
		evt.initCustomEvent( event_name, true,true, params ); //canBubble, cancelable, detail
		evt.srcElement = origin;
		if( element.dispatchEvent )
			element.dispatchEvent( evt );
		else if( element.__events )
			element.__events.dispatchEvent( evt );
		//else nothing seems binded here so nothing to do
		return evt;
	},

	/**
	* Binds an event in an object (similar to jQuery.bind)
	* If the element is not an HTML entity a new one is created, attached to the object (as non-enumerable, called __events) and used
	* @method trigger
	* @param {Object} element could be an HTMLEntity, a regular object, a query string or a regular Array of entities
	* @param {String} event the string defining the event
	* @param {Function} callback where to call
	*/
	bind: function( element, event, callback )
	{
		if(!element)
			throw("Cannot bind to null");
		if(!event)
			throw("Event bind missing");
		if(!callback)
			throw("Bind callback missing");

		if(element.constructor === String)
			element = document.querySelectorAll( element );
			
		if(element.constructor === NodeList || element.constructor === Array)
		{
			for(var i = 0; i < element.length; ++i)
				inner( element[i] );
		}
		else
			inner( element );

		function inner( element )
		{
			if(element.addEventListener)
				element.addEventListener(event, callback);
			else if(element.__events)
				element.__events.addEventListener( event, callback );
			else
			{
				//create a dummy HTMLentity so we can use it to bind HTML events
				var dummy = document.createElement("span");
				dummy.widget = element; //double link
				Object.defineProperty( element, "__events", {
					enumerable: false,
					configurable: false,
					writable: false,
					value: dummy
				});
				element.__events.addEventListener( event, callback );
			}
		}
	},

	/**
	* Unbinds an event in an object (similar to jQuery.unbind)
	* @method unbind
	* @param {Object} element could be an HTMLEntity or a regular object
	* @param {String} event the string defining the event
	* @param {Function} callback where to call
	*/
	unbind: function(element, event, callback)
	{
		if( element.removeEventListener )
			element.removeEventListener( event, callback );
		else if( element.__events && element.__events.removeEventListener )
			element.__events.removeEventListener( event, callback );
	},

	/**
	* removes a class 
	* @method removeClass
	* @param {HTMLElement} root
	* @param {String} selector
	* @param {String} class_name
	*/
	removeClass: function( elem, selector, class_name ){
		if(!class_name)
		{
			class_name = selector;
			selector = "." + selector;
		}
		var list = (elem || document).querySelectorAll( selector );
		for(var i = 0; i < list.length; ++i)
			list[i].classList.remove(class_name);
	},

	/**
	* Appends litegui widget to the global interface
	* @method add
	* @param {Object} litegui_element
	*/
	add: function( litegui_element )
	{
		this.content.appendChild( litegui_element.root || litegui_element );
	},

	/**
	* Remove from the interface, it is is an HTML element it is removed from its parent, if it is a widget the same.
	* @method remove
	* @param {Object} litegui_element it also supports HTMLentity, selector string or Array of elements
	*/
	remove: function( element )
	{
		if(!element)
			return;

		if( element.constructor === String ) //selector
		{
			var elements = document.querySelectorAll( element );
			for(var i = 0; i < elements.length; ++i)
			{
				var element = elements[i];
				if(element && element.parentNode)
					element.parentNode.removeChild(element);
			}
		}
		if( element.constructor === Array || element.constructor === NodeList ) 
		{
			for(var i = 0; i < element.length; ++i)
				LiteGUI.remove( element[i] );
		}
		else if( element.root && element.root.parentNode ) //ltiegui widget
			element.root.parentNode.removeChild( element.root );
		else if( element.parentNode ) //regular HTML entity
			element.parentNode.removeChild( element );
	},

	/**
	* wrapper of document.getElementById
	* @method getById
	* @param {String} id
	* return {HTMLEntity}
	**/
	getById: function(id)
	{
		return document.getElementById(id);
	},

	createMenubar: function()
	{
		this.menubar = new LiteGUI.Menubar("mainmenubar");
		this.add( this.menubar );
	},

	setWindowSize: function(w,h)
	{
		var style = this.root.style;

		if(w && h)
		{
			style.width = w+"px";
			style.height = h + "px";
			style.boxShadow = "0 0 4px black"
			this.root.classList.remove("fullscreen");
		}
		else
		{
			if( this.root.classList.contains("fullscreen") )
				return;
			this.root.classList.add("fullscreen");
			style.width = "100%";
			style.height = "100%";
			style.boxShadow = "0 0 0";
		}
		LiteGUI.trigger( LiteGUI, "resized");
	},

	maximizeWindow: function()
	{
		this.setWindowSize();
	},

	/**
	* Change cursor
	* @method setCursor
	* @param {String} cursor
	**/
	setCursor: function( name )
	{
		this.root.style.cursor = name;
	},

	/**
	* Test if the cursor is inside an element
	* @method setCursor
	* @param {String} cursor
	**/
	isCursorOverElement: function( event, element )
	{
		var left = event.pageX;
		var top = event.pageY;
		var rect = element.getBoundingClientRect();
		if(!rect)
			return false;
		if(top > rect.top && top < (rect.top + rect.height) &&
			left > rect.left && left < (rect.left + rect.width) )
			return true;
		return false;
	},

	getRect: function(element)
	{
		return element.getBoundingClientRect();
	},

	/**
	* Copy a string to the clipboard (it needs to be invoqued from a click event)
	* @method toClipboard
	* @param {String} data
	* @param {Boolean} force_local force to store the data in the browser clipboard (this one can be read back)
	**/
	toClipboard: function( object, force_local )
	{
		if(object && object.constructor !== String )
			object = JSON.stringify( object );

		var input = null;
		var in_clipboard = false;
		if( !force_local )
		try
		{
			var copySupported = document.queryCommandSupported('copy');
			input = document.createElement("input");
			input.type = "text";
			input.style.opacity = 0;
			input.value = object;
			document.body.appendChild( input );
			input.select();
			in_clipboard = document.execCommand('copy');
			console.log( in_clipboard ? "saved to clipboard" : "problem saving to clipboard");
			document.body.removeChild( input );
		} catch (err) {
			if(input)
				document.body.removeChild( input );
			console.warn('Oops, unable to copy using the true clipboard');
		}

		//old system
		try
		{
			this._safe_cliboard = null;
			localStorage.setItem("litegui_clipboard", object );
		}
		catch (err)
		{
			this._safe_cliboard = object;
			console.warn("cliboard quota excedeed");
		}
	},

	/**
	* Reads from the secondary clipboard (only can read if the data was stored using the toClipboard)
	* @method getLocalClipboard
	* @return {String} clipboard
	**/
	getLocalClipboard: function()
	{
		var data = localStorage.getItem("litegui_clipboard");
		if(!data && this._safe_cliboard)
			data = this._safe_cliboard;
		if(!data) 
			return null;
		if(data[0] == "{")
			return JSON.parse( data );
		return data;
	},

	/**
	* Insert some CSS code to the website
	* @method addCSS
	* @param {String|Object} code it could be a string with CSS rules, or an object with the style syntax.
	**/
	addCSS: function(code)
	{
		if(!code)
			return;

		if(code.constructor === String)
		{
			var style = document.createElement('style');
			style.type = 'text/css';
			style.innerHTML = code;
			document.getElementsByTagName('head')[0].appendChild(style);
			return;
		}
		else
		{
			for(var i in code)
			document.body.style[i] = code[i];
		}
	},

	/**
	* Requires a new CSS
	* @method requireCSS
	* @param {String} url string with url or an array with several urls
	* @param {Function} on_complete
	**/
	requireCSS: function(url, on_complete)
	{
		if(typeof(url)=="string")
			url = [url];

		while(url.length)
		{
			var link  = document.createElement('link');
			//link.id   = cssId;
			link.rel  = 'stylesheet';
			link.type = 'text/css';
			link.href = url.shift(1);
			link.media = 'all';
			var head = document.getElementsByTagName('head')[0];
			head.appendChild(link);
			if(url.length == 0)
				link.onload = on_complete;
		}
	},

	/**
	* Request file from url (it could be a binary, text, etc.). If you want a simplied version use 
	* @method request
	* @param {Object} request object with all the parameters like data (for sending forms), dataType, success, error
	* @param {Function} on_complete
	**/
	request: function(request)
	{
		var dataType = request.dataType || "text";
		if(dataType == "json") //parse it locally
			dataType = "text";
		else if(dataType == "xml") //parse it locally
			dataType = "text";
		else if (dataType == "binary")
		{
			//request.mimeType = "text/plain; charset=x-user-defined";
			dataType = "arraybuffer";
			request.mimeType = "application/octet-stream";
		}	

		//regular case, use AJAX call
        var xhr = new XMLHttpRequest();
        xhr.open( request.data ? 'POST' : 'GET', request.url, true);
        if(dataType)
            xhr.responseType = dataType;
        if (request.mimeType)
            xhr.overrideMimeType( request.mimeType );
		if( request.nocache )
			xhr.setRequestHeader('Cache-Control', 'no-cache');

        xhr.onload = function(load)
		{
			var response = this.response;
			if(this.status != 200)
			{
				var err = "Error " + this.status;
				if(request.error)
					request.error(err);
				LEvent.trigger(xhr,"fail", this.status);
				return;
			}

			if(request.dataType == "json") //chrome doesnt support json format
			{
				try
				{
					response = JSON.parse(response);
				}
				catch (err)
				{
					if(request.error)
						request.error(err);
					else
						throw err;
				}
			}
			else if(request.dataType == "xml")
			{
				try
				{
					var xmlparser = new DOMParser();
					response = xmlparser.parseFromString(response,"text/xml");
				}
				catch (err)
				{
					if(request.error)
						request.error(err);
					else
						throw err;
				}
			}
			if(request.success)
				request.success.call(this, response, this);
		};
        xhr.onerror = function(err) {
			if(request.error)
				request.error(err);
		}

		var data = new FormData();
		if( request.data )
		{
			for(var i in request.data)
				data.append(i,request.data[i]);
		}

        xhr.send( data );
		return xhr;
	},	

	/**
	* Request file from url
	* @method requestText
	* @param {String} url
	* @param {Function} on_complete
	* @param {Function} on_error
	**/
	requestText: function(url, on_complete, on_error )
	{
		return this.request({ url: url, dataType:"text", success: on_complete, error: on_error });
	},

	/**
	* Request file from url
	* @method requestJSON
	* @param {String} url
	* @param {Function} on_complete
	* @param {Function} on_error
	**/
	requestJSON: function(url, on_complete, on_error )
	{
		return this.request({ url: url, dataType:"json", success: on_complete, error: on_error });
	},

	/**
	* Request binary file from url
	* @method requestBinary
	* @param {String} url
	* @param {Function} on_complete
	* @param {Function} on_error
	**/
	requestBinary: function(url, on_complete, on_error )
	{
		return this.request({ url: url, dataType:"binary", success: on_complete, error: on_error });
	},
	
	
	/**
	* Request script and inserts it in the DOM
	* @method requireScript
	* @param {String|Array} url the url of the script or an array containing several urls
	* @param {Function} on_complete
	* @param {Function} on_error
	* @param {Function} on_progress (if several files are required, on_progress is called after every file is added to the DOM)
	**/
	requireScript: function(url, on_complete, on_error, on_progress, version )
	{
		if(!url)
			throw("invalid URL");

		if( url.constructor === String )
			url = [url];

		var total = url.length;
		var size = total;
		var loaded_scripts = [];

		for(var i in url)
		{
			var script = document.createElement('script');
			script.num = i;
			script.type = 'text/javascript';
			script.src = url[i] + ( version ? "?version=" + version : "" );
			script.original_src = url[i];
			script.async = false;
			script.onload = function(e) { 
				total--;
				loaded_scripts.push(this);
				if(total)
				{
					if(on_progress)
						on_progress(this.original_src, this.num);
				}
				else if(on_complete)
					on_complete( loaded_scripts );
			};
			if(on_error)
				script.onerror = function(err) { 
					on_error(err, this.original_src, this.num );
				}
			document.getElementsByTagName('head')[0].appendChild(script);
		}
	},


	//old version, it loads one by one, so it is slower
	requireScriptSerial: function(url, on_complete, on_progress )
	{
		if(typeof(url)=="string")
			url = [url];

		var loaded_scripts = [];
		function addScript()
		{
			var script = document.createElement('script');
			script.type = 'text/javascript';
			script.src = url.shift(1);
			script.onload = function(e) { 
				if(url.length)
				{
					if(on_progress)
						on_progress(url[0], url.length);

					addScript();
					return;
				}

				loaded_scripts.push(this);
				
				if(on_complete)
					on_complete( loaded_scripts );
			};
			document.getElementsByTagName('head')[0].appendChild(script);
		}

		addScript();
	},

	newDiv: function(id, code)
	{
		return this.createElement("div",id,code);
	},

	/**
	* Request script and inserts it in the DOM
	* @method createElement
	* @param {String} tag
	* @param {String} id_class string containing id and classes, example: "myid .someclass .anotherclass"
	* @param {String} content
	* @param {Object} style
	**/
	createElement: function(tag, id_class, content, style, events)
	{
		var elem = document.createElement( tag );
		if(id_class)
		{
			var t = id_class.split(" ");
			for(var i = 0; i < t.length; i++)
			{
				if(t[i][0] == ".")
					elem.classList.add( t[i].substr(1) );
				else if(t[i][0] == "#")
					elem.id = t[i].substr(1);
				else
					elem.id = t[i];
			}
		}
		elem.root = elem;
		if(content)
			elem.innerHTML = content;
		elem.add = function(v) { this.appendChild( v.root || v ); };

		if(style)
		{
			if(style.constructor === String)
				elem.setAttribute("style",style);
			else
				for(var i in style)
					elem.style[i] = style[i];
		}

		if(events)
		{
			for(var i in events)
				elem.addEventListener(i, events[i]);
		}
		return elem;
	},

	/**
	* Useful to create elements from a text like '<div><span class="title"></span></div>' and an object like { ".title":"mytitle" }
	* @method createListItem
	* @param {String} code
	* @param {Object} values it will use innerText in the elements that matches that selector
	* @param {Object} style
	* @return {HTMLElement} 
	**/
	createListItem: function( code, values, style )
	{
		var elem = document.createElement("span");
		elem.innerHTML = code;
		elem = elem.childNodes[0]; //to get the node
		if(values)
		for(var i in values)
		{
			var subelem = elem.querySelector(i);
			if(subelem)
				subelem.innerText = values[i];
		}
		if(style)
		for(var i in style)
			elem.style[i] = style[i];
		return elem;
	},

	/**
	* Request script and inserts it in the DOM
	* @method createButton
	* @param {String} id
	* @param {String} content
	* @param {Function} callback when the button is pressed
	* @param {Object|String} style
	**/
	createButton: function( id_class, content, callback, style )
	{
		var elem = document.createElement("button");
		elem.className = "litegui litebutton button";
		if(id_class)
		{
			var t = id_class.split(" ");
			for(var i = 0; i < t.length; i++)
			{
				if(t[i][0] == ".")
					elem.classList.add( t[i].substr(1) );
				else if(t[i][0] == "#")
					elem.id = t[i].substr(1);
				else
					elem.id = t[i];
			}
		}
		elem.root = elem;
		if(content !== undefined)
			elem.innerHTML = content;
		if(callback)
			elem.addEventListener("click", callback );
		if(style)
		{
			if(style.constructor === String)
				elem.setAttribute("style",style);
			else
				for(var i in style)
					elem.style[i] = style[i];
		}
		return elem;
	},

	getParents: function(element)
	{
		var elements = [];
		while ((element = element.parentElement) !== null) {
			if (element.nodeType !== Node.ELEMENT_NODE)
				continue;
			elements.push(elem);
		}
		return elements;
	},

	//used to create a window that retains all the CSS info or the scripts.
	newWindow: function(title, width, height, options)
	{
		options = options || {};
		var new_window = window.open("","","width="+width+", height="+height+", location=no, status=no, menubar=no, titlebar=no, fullscreen=yes");
		new_window.document.write( "<html><head><title>"+title+"</title>" );

		//transfer style
		var styles = document.querySelectorAll("link[rel='stylesheet'],style");
		for(var i = 0; i < styles.length; i++)
			new_window.document.write( styles[i].outerHTML );

		//transfer scripts (optional because it can produce some errors)
		if(options.scripts)
		{
			var scripts = document.querySelectorAll("script");
			for(var i = 0; i < scripts.length; i++)
			{
				if(scripts[i].src) //avoid inline scripts, otherwise a cloned website would be created
					new_window.document.write( scripts[i].outerHTML );
			}
		}


		var content = options.content || "";
		new_window.document.write( "</head><body>"+content+"</body></html>" );
		new_window.document.close();
		return new_window;
	},

	//* DIALOGS *******************
	showModalBackground: function(v)
	{
		if(LiteGUI.modalbg_div)
			LiteGUI.modalbg_div.style.display = v ? "block" : "none";
	},

	showMessage: function(content, options)
	{
		options = options || {};
		
		options.title = options.title || "Attention";
		options.content = content;
		options.close = 'fade';
		var dialog = new LiteGUI.Dialog( options );
		if(!options.noclose)
			dialog.addButton("Close",{ close: true });
		dialog.makeModal('fade');
		return dialog;
	},

	/**
	* Shows a dialog with a message
	* @method popup
	* @param {String} content
	* @param {Object} options ( min_height, content, noclose )
	**/
	popup: function( content, options )
	{
		options = options || {};

		options.min_height = 140;
		if (typeof(content) == "string")
			content = "<p>" + content + "</p>";

		options.content = content;
		options.close = 'fade';

		var dialog = new LiteGUI.Dialog(options);
		if(!options.noclose)
			dialog.addButton("Close",{ close: true });
		dialog.show();
		return dialog;
	},


	/**
	* Shows an alert dialog with a message
	* @method alert
	* @param {String} content
	* @param {Object} options ( title, width, height, content, noclose )
	**/
	alert: function( content, options )
	{
		options = options || {};

		
		options.className = "alert";
		options.title = options.title || "Alert";
		options.width = options.width || 280;
		options.height = options.height || 140;
		if (typeof(content) == "string")
			content = "<p>" + content + "</p>";
		LiteGUI.remove(".litepanel.alert"); //kill other panels
		return LiteGUI.showMessage(content,options);
	},

	/**
	* Shows a confirm dialog with a message
	* @method confirm
	* @param {String} content
	* @param {Function} callback
	* @param {Object} options ( title, width, height, content, noclose )
	**/
	confirm: function( content, callback, options )
	{
		options = options || {};
		options.className = "alert";
		options.title = options.title || "Confirm";
		options.width = options.width || 280;
		//options.height = 100;
		if (typeof(content) == "string")
			content = "<p>" + content + "</p>";

		content +="<button class='litebutton' data-value='yes' style='width:45%; margin-left: 10px'>Yes</button><button class='litebutton' data-value='no' style='width:45%'>No</button>";
		options.noclose = true;

		var dialog = this.showMessage(content,options);
		dialog.content.style.paddingBottom = "10px";
		var buttons = dialog.content.querySelectorAll("button");
		for(var i = 0; i < buttons.length; i++)
			buttons[i].addEventListener("click", inner);
		buttons[0].focus();

		function inner(v) {
			var v = this.dataset["value"] == "yes";
			dialog.close(); //close before callback
			if(callback) 
				callback(v);
		}

		return dialog;
	},

	/**
	* Shows a prompt dialog with a message
	* @method prompt
	* @param {String} content
	* @param {Function} callback
	* @param {Object} options ( title, width, height, content, noclose )
	**/
	prompt: function( content, callback, options )
	{
		options = options || {};
		options.className = "alert";
		options.title = options.title || "Prompt";
		options.width = options.width || 280;

		//options.height = 140 + (options.textarea ? 40 : 0);
		if (typeof(content) == "string")
			content = "<p>" + content + "</p>";

		var value = options.value || "";
		var textinput = "<input type='text' value='"+value+"'/>";
		if (options.textarea)
			textinput = "<textarea class='textfield' style='width:95%'>"+value+"</textarea>";

		content +="<p>"+textinput+"</p><button class='litebutton' data-value='accept' style='width:45%; margin-left: 10px; margin-bottom: 10px'>Accept</button><button class='litebutton' data-value='cancel' style='width:45%'>Cancel</button>";
		options.noclose = true;
		var dialog = this.showMessage( content, options );

		var buttons = dialog.content.querySelectorAll("button");
		for(var i = 0; i < buttons.length; i++)
			buttons[i].addEventListener("click", inner);

		var input = dialog.content.querySelector("input,textarea");
		input.addEventListener("keydown", inner_key, true);

		function inner() {
			var value = input.value;
			if(this.dataset && this.dataset["value"] == "cancel")
				value = null;
			dialog.close(); //close before callback
			if(callback)
				callback( value );
		};

		function inner_key(e)
		{
			if (!e)
				e = window.event;
			var keyCode = e.keyCode || e.which;
			if (keyCode == '13'){
				inner();
				return false;
			}		
			if (keyCode == '29')
				dialog.close();
		};

		input.focus();
		return dialog;
	},

	/**
	* Shows a choice dialog with a message
	* @method choice
	* @param {String} content
	* @param {Function} callback
	* @param {Object} options ( title, width, height, content, noclose )
	**/
	choice: function( content, choices, callback, options )
	{
		options = options || {};
		options.className = "alert";
		options.title = options.title || "Select one option";
		options.width = options.width || 280;
		//options.height = 100;
		if (typeof(content) == "string")
			content = "<p>" + content + "</p>";

		for(var i in choices)
		{
			content +="<button class='litebutton' data-value='"+i+"' style='width:45%; margin-left: 10px'>"+(choices[i].content || choices[i])+"</button>";
		}
		options.noclose = true;

		var dialog = this.showMessage(content,options);
		dialog.content.style.paddingBottom = "10px";
		var buttons = dialog.content.querySelectorAll("button");
		for(var i = 0; i < buttons.length; i++)
			buttons[i].addEventListener("click", inner);

		function inner(v) {
			var v = choices[ this.dataset["value"] ];
			dialog.close(); //close before callback
			if(callback) 
				callback(v);
		}

		return dialog;
	},

	downloadURL: function( url, filename )
	{
		var link = document.createElement('a');
		link.href = url;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	},

	downloadFile: function( filename, data, dataType )
	{
		if(!data)
		{
			console.warn("No file provided to download");
			return;
		}

		if(!dataType)
		{
			if(data.constructor === String )
				dataType = 'text/plain';
			else
				dataType = 'application/octet-stream';
		}

		var file = null;
		if(data.constructor !== File && data.constructor !== Blob)
			file = new Blob( [ data ], {type : dataType});
		else
			file = data;

		var url = URL.createObjectURL( file );
		var element = document.createElement("a");
		element.setAttribute('href', url);
		element.setAttribute('download', filename );
		element.style.display = 'none';
		document.body.appendChild(element);
		element.click();
		document.body.removeChild(element);
		setTimeout( function(){ URL.revokeObjectURL( url ); }, 1000*60 ); //wait one minute to revoke url
	},

	/**
	* Returns the URL vars ( ?foo=faa&foo2=etc )
	* @method getUrlVars
	**/
	getUrlVars: function(){
		var vars = [], hash;
		var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
		for(var i = 0; i < hashes.length; i++)
		{
		  hash = hashes[i].split('=');
		  vars.push(hash[0]);
		  vars[hash[0]] = hash[1];
		}
		return vars;
	},

	getUrlVar: function(name) {
		return LiteGUI.getUrlVars()[name];
	},

	focus: function( element )
	{
		element.focus();
	},

	blur: function( element )
	{
		element.blur();
	},

	/**
	* Makes one element draggable
	* @method draggable
	* @param {HTMLEntity} container the element that will be dragged
	* @param {HTMLEntity} dragger the area to start the dragging
	**/
	draggable: function( container, dragger, on_start, on_finish, on_is_draggable )
	{
		dragger = dragger || container;
		dragger.addEventListener("mousedown", inner_mouse);
		dragger.style.cursor = "move";
		var prev_x = 0;
		var prev_y = 0;

		var rect = container.getClientRects()[0];
		var x = rect ? rect.left : 0;
		var y = rect ? rect.top : 0;

		container.style.position = "absolute";
		container.style.left = x + "px";
		container.style.top = y + "px";

		function inner_mouse(e)
		{
			if(e.type == "mousedown")
			{
				if(!rect)
				{
					rect = container.getClientRects()[0];
					x = rect ? rect.left : 0;
					y = rect ? rect.top : 0;
				}

				if(on_is_draggable && on_is_draggable(container,e) == false )
				{
					e.stopPropagation();
					e.preventDefault();
					return false;
				}

				prev_x = e.clientX;
				prev_y = e.clientY;
				document.addEventListener("mousemove",inner_mouse);
				document.addEventListener("mouseup",inner_mouse);
				if(on_start)
					on_start( container, e );
				e.stopPropagation();
				e.preventDefault();
				return false;
			}

			if(e.type == "mouseup")
			{
				document.removeEventListener("mousemove",inner_mouse);
				document.removeEventListener("mouseup",inner_mouse);

				if( on_finish )
					on_finish( container, e );
				return;
			}

			if(e.type == "mousemove")
			{
				var deltax = e.clientX - prev_x;
				var deltay = e.clientY - prev_y;
				prev_x = e.clientX;
				prev_y = e.clientY;
				x += deltax;
				y += deltay;
				container.style.left = x + "px";
				container.style.top = y + "px";
			}
		}
	},

	/**
	* Clones object content
	* @method cloneObject
	* @param {Object} object
	* @param {Object} target
	**/
	cloneObject: function(object, target)
	{
		var o = target || {};
		for(var i in object)
		{
			if(i[0] == "_" || i.substr(0,6) == "jQuery") //skip vars with _ (they are private)
				continue;

			var v = object[i];
			if(v == null)
				o[i] = null;			
			else if ( isFunction(v) )
				continue;
			else if (typeof(v) == "number" || typeof(v) == "string")
				o[i] = v;
			else if( v.constructor == Float32Array ) //typed arrays are ugly when serialized
				o[i] = Array.apply( [], v ); //clone
			else if ( isArray(v) )
			{
				if( o[i] && o[i].constructor == Float32Array ) //reuse old container
					o[i].set(v);
				else
					o[i] = JSON.parse( JSON.stringify(v) ); //v.slice(0); //not safe using slice because it doesnt clone content, only container
			}
			else //slow but safe
			{
				try
				{
					//prevent circular recursions
					o[i] = JSON.parse( JSON.stringify(v) );
				}
				catch (err)
				{
					console.error(err);
				}
			}
		}
		return o;
	},

	safeName: function( str )
	{
		return String(str).replace(/[\s\.]/g, '');
	},

	//those useful HTML unicode codes that I never remeber but I always need
	special_codes: {
		close: "&#10005;",
		navicon: "&#9776;",
		refresh: "&#8634;",
		gear: "&#9881;",
		open_folder: "&#128194;",
		download: "&#11123;",
		tick: "&#10003;",
		trash: "&#128465;"
	},
	
	//given a html entity string it returns the equivalent unicode character
	htmlEncode: function( html_code )
	{
		var e = document.createElement("div");
		e.innerHTML = html_code;
		return e.innerText;
	},

	//given a unicode character it returns the equivalent html encoded string
	htmlDecode: function( unicode_character )
	{
		var e = document.createElement("div");
		e.innerText = unicode_character;
		return e.innerHTML;
	},

	/**
	* Convert sizes in any format to a valid CSS format (number to string, negative number to calc( 100% - number px )
	* @method sizeToCSS
	* @param {String||Number} size
	* @return {String} valid css size string
	**/
	sizeToCSS: function( v )
	{
		if( v ===  undefined || v === null )
			return null;
		if(v.constructor === String )
			return v;
		if(v >= 0 )
			return (v|0) + "px";
		return "calc( 100% - " + Math.abs(v|0) + "px )";
	},

	/**
	* Returns the window where this element is attached (used in multi window applications)
	* @method getElementWindow
	* @param {HTMLElement} v
	* @return {Window} the window element
	**/
	getElementWindow: function(v)
	{
        var doc = v.ownerDocument;
        return doc.defaultView || doc.parentWindow;
	},

	/**
	* Helper, makes drag and drop easier by enabling drag and drop in a given element
	* @method createDropArea
	* @param {HTMLElement} element the element where users could drop items
	* @param {Function} callback_drop function to call when the user drops the item
	* @param {Function} callback_enter [optional] function to call when the user drags something inside
	**/
	createDropArea: function( element, callback_drop, callback_enter, callback_exit )
	{
		element.addEventListener("dragenter", onDragEvent);

		function onDragEvent(evt)
		{
			element.addEventListener("dragexit", onDragEvent);
			element.addEventListener("dragover", onDragEvent);
			element.addEventListener("drop", onDrop);
			evt.stopPropagation();
			evt.preventDefault();
			if(evt.type == "dragenter" && callback_enter)
				callback_enter(evt, this);
			if(evt.type == "dragexit" && callback_exit)
				callback_exit(evt, this);
		}

		function onDrop(evt)
		{
			evt.stopPropagation();
			evt.preventDefault();

			element.removeEventListener("dragexit", onDragEvent);
			element.removeEventListener("dragover", onDragEvent);
			element.removeEventListener("drop", onDrop);

			var r = undefined;
			if(callback_drop)
				r = callback_drop(evt);
			if(r)
			{
				evt.stopPropagation();
				evt.stopImmediatePropagation();
				return true;
			}
		}
	}
};

//low quality templating system
Object.defineProperty( String.prototype, "template", {
	value: function( data, eval_code )
	{
		var tpl = this;
		var re = /{{([^}}]+)?}}/g, match;
	    while(match = re.exec(tpl)) {
			var str = eval_code ? (new Function("with(this) { try { return " + match[1] +"} catch(e) { return 'error';} }")).call(data) : data[match[1]];
		    tpl = tpl.replace(match[0], str);
	    }
	    return tpl;		
	},
	enumerable: false
});


function purgeElement(d, skip) {
    var a = d.attributes, i, l, n;

    if (a) {
        for (i = a.length - 1; i >= 0; i -= 1) {
            n = a[i].name;
            if (typeof d[n] === 'function') {
                d[n] = null;
            }
        }
    }

    a = d.childNodes;
    if (a) {
        l = a.length;
        for (i = 0; i < l; i += 1) {
            purgeElement(d.childNodes[i]);
        }
    }
}

//useful functions

//from stackoverflow http://stackoverflow.com/questions/1354064/how-to-convert-characters-to-html-entities-using-plain-javascript

if(typeof escapeHtmlEntities == 'undefined') {
        escapeHtmlEntities = function (text) {
            return text.replace(/[\u00A0-\u2666<>\&]/g, function(c) {
                return '&' + 
                (escapeHtmlEntities.entityTable[c.charCodeAt(0)] || '#'+c.charCodeAt(0)) + ';';
            });
        };

        // all HTML4 entities as defined here: http://www.w3.org/TR/html4/sgml/entities.html
        // added: amp, lt, gt, quot and apos
        escapeHtmlEntities.entityTable = {
            34 : 'quot', 
            38 : 'amp', 
            39 : 'apos', 
            60 : 'lt', 
            62 : 'gt', 
            160 : 'nbsp', 
            161 : 'iexcl', 
            162 : 'cent', 
            163 : 'pound', 
            164 : 'curren', 
            165 : 'yen', 
            166 : 'brvbar', 
            167 : 'sect', 
            168 : 'uml', 
            169 : 'copy', 
            170 : 'ordf', 
            171 : 'laquo', 
            172 : 'not', 
            173 : 'shy', 
            174 : 'reg', 
            175 : 'macr', 
            176 : 'deg', 
            177 : 'plusmn', 
            178 : 'sup2', 
            179 : 'sup3', 
            180 : 'acute', 
            181 : 'micro', 
            182 : 'para', 
            183 : 'middot', 
            184 : 'cedil', 
            185 : 'sup1', 
            186 : 'ordm', 
            187 : 'raquo', 
            188 : 'frac14', 
            189 : 'frac12', 
            190 : 'frac34', 
            191 : 'iquest', 
            192 : 'Agrave', 
            193 : 'Aacute', 
            194 : 'Acirc', 
            195 : 'Atilde', 
            196 : 'Auml', 
            197 : 'Aring', 
            198 : 'AElig', 
            199 : 'Ccedil', 
            200 : 'Egrave', 
            201 : 'Eacute', 
            202 : 'Ecirc', 
            203 : 'Euml', 
            204 : 'Igrave', 
            205 : 'Iacute', 
            206 : 'Icirc', 
            207 : 'Iuml', 
            208 : 'ETH', 
            209 : 'Ntilde', 
            210 : 'Ograve', 
            211 : 'Oacute', 
            212 : 'Ocirc', 
            213 : 'Otilde', 
            214 : 'Ouml', 
            215 : 'times', 
            216 : 'Oslash', 
            217 : 'Ugrave', 
            218 : 'Uacute', 
            219 : 'Ucirc', 
            220 : 'Uuml', 
            221 : 'Yacute', 
            222 : 'THORN', 
            223 : 'szlig', 
            224 : 'agrave', 
            225 : 'aacute', 
            226 : 'acirc', 
            227 : 'atilde', 
            228 : 'auml', 
            229 : 'aring', 
            230 : 'aelig', 
            231 : 'ccedil', 
            232 : 'egrave', 
            233 : 'eacute', 
            234 : 'ecirc', 
            235 : 'euml', 
            236 : 'igrave', 
            237 : 'iacute', 
            238 : 'icirc', 
            239 : 'iuml', 
            240 : 'eth', 
            241 : 'ntilde', 
            242 : 'ograve', 
            243 : 'oacute', 
            244 : 'ocirc', 
            245 : 'otilde', 
            246 : 'ouml', 
            247 : 'divide', 
            248 : 'oslash', 
            249 : 'ugrave', 
            250 : 'uacute', 
            251 : 'ucirc', 
            252 : 'uuml', 
            253 : 'yacute', 
            254 : 'thorn', 
            255 : 'yuml', 
            402 : 'fnof', 
            913 : 'Alpha', 
            914 : 'Beta', 
            915 : 'Gamma', 
            916 : 'Delta', 
            917 : 'Epsilon', 
            918 : 'Zeta', 
            919 : 'Eta', 
            920 : 'Theta', 
            921 : 'Iota', 
            922 : 'Kappa', 
            923 : 'Lambda', 
            924 : 'Mu', 
            925 : 'Nu', 
            926 : 'Xi', 
            927 : 'Omicron', 
            928 : 'Pi', 
            929 : 'Rho', 
            931 : 'Sigma', 
            932 : 'Tau', 
            933 : 'Upsilon', 
            934 : 'Phi', 
            935 : 'Chi', 
            936 : 'Psi', 
            937 : 'Omega', 
            945 : 'alpha', 
            946 : 'beta', 
            947 : 'gamma', 
            948 : 'delta', 
            949 : 'epsilon', 
            950 : 'zeta', 
            951 : 'eta', 
            952 : 'theta', 
            953 : 'iota', 
            954 : 'kappa', 
            955 : 'lambda', 
            956 : 'mu', 
            957 : 'nu', 
            958 : 'xi', 
            959 : 'omicron', 
            960 : 'pi', 
            961 : 'rho', 
            962 : 'sigmaf', 
            963 : 'sigma', 
            964 : 'tau', 
            965 : 'upsilon', 
            966 : 'phi', 
            967 : 'chi', 
            968 : 'psi', 
            969 : 'omega', 
            977 : 'thetasym', 
            978 : 'upsih', 
            982 : 'piv', 
            8226 : 'bull', 
            8230 : 'hellip', 
            8242 : 'prime', 
            8243 : 'Prime', 
            8254 : 'oline', 
            8260 : 'frasl', 
            8472 : 'weierp', 
            8465 : 'image', 
            8476 : 'real', 
            8482 : 'trade', 
            8501 : 'alefsym', 
            8592 : 'larr', 
            8593 : 'uarr', 
            8594 : 'rarr', 
            8595 : 'darr', 
            8596 : 'harr', 
            8629 : 'crarr', 
            8656 : 'lArr', 
            8657 : 'uArr', 
            8658 : 'rArr', 
            8659 : 'dArr', 
            8660 : 'hArr', 
            8704 : 'forall', 
            8706 : 'part', 
            8707 : 'exist', 
            8709 : 'empty', 
            8711 : 'nabla', 
            8712 : 'isin', 
            8713 : 'notin', 
            8715 : 'ni', 
            8719 : 'prod', 
            8721 : 'sum', 
            8722 : 'minus', 
            8727 : 'lowast', 
            8730 : 'radic', 
            8733 : 'prop', 
            8734 : 'infin', 
            8736 : 'ang', 
            8743 : 'and', 
            8744 : 'or', 
            8745 : 'cap', 
            8746 : 'cup', 
            8747 : 'int', 
            8756 : 'there4', 
            8764 : 'sim', 
            8773 : 'cong', 
            8776 : 'asymp', 
            8800 : 'ne', 
            8801 : 'equiv', 
            8804 : 'le', 
            8805 : 'ge', 
            8834 : 'sub', 
            8835 : 'sup', 
            8836 : 'nsub', 
            8838 : 'sube', 
            8839 : 'supe', 
            8853 : 'oplus', 
            8855 : 'otimes', 
            8869 : 'perp', 
            8901 : 'sdot', 
            8968 : 'lceil', 
            8969 : 'rceil', 
            8970 : 'lfloor', 
            8971 : 'rfloor', 
            9001 : 'lang', 
            9002 : 'rang', 
            9674 : 'loz', 
            9824 : 'spades', 
            9827 : 'clubs', 
            9829 : 'hearts', 
            9830 : 'diams', 
            338 : 'OElig', 
            339 : 'oelig', 
            352 : 'Scaron', 
            353 : 'scaron', 
            376 : 'Yuml', 
            710 : 'circ', 
            732 : 'tilde', 
            8194 : 'ensp', 
            8195 : 'emsp', 
            8201 : 'thinsp', 
            8204 : 'zwnj', 
            8205 : 'zwj', 
            8206 : 'lrm', 
            8207 : 'rlm', 
            8211 : 'ndash', 
            8212 : 'mdash', 
            8216 : 'lsquo', 
            8217 : 'rsquo', 
            8218 : 'sbquo', 
            8220 : 'ldquo', 
            8221 : 'rdquo', 
            8222 : 'bdquo', 
            8224 : 'dagger', 
            8225 : 'Dagger', 
            8240 : 'permil', 
            8249 : 'lsaquo', 
            8250 : 'rsaquo', 
            8364 : 'euro'
        };
    }

function beautifyCode( code, reserved, skip_css )
{
	reserved = reserved || ["abstract", "else", "instanceof", "super", "boolean", "enum", "int", "switch", "break", "export", "interface", "synchronized", "byte", "extends", "let", "this", "case", "false", "long", "throw", "catch", "final", "native", "throws", "char", "finally", "new", "transient", "class", "float", "null", "true", "const", "for", "package", "try", "continue", "function", "private", "typeof", "debugger", "goto", "protected", "var", "default", "if", "public", "void", "delete", "implements", "return", "volatile", "do", "import", "short", "while", "double", "in", "static", "with"];

	//reserved words
	code = code.replace(/\b(\w+)\b/g, function(v) {
		if(reserved.indexOf(v) != -1)
			return "<span class='rsv'>" + v + "</span>";
		return v;
	});

	//numbers
	code = code.replace(/\b([0-9]+)\b/g, function(v) {
		return "<span class='num'>" + v + "</span>";
	});

	//obj.method
	code = code.replace(/(\w+\.\w+)/g, function(v) {
		var t = v.split(".");
		return "<span class='obj'>" + t[0] + "</span>.<span class='prop'>" + t[1] + "</span>";
	});

	//function
	code = code.replace(/(\w+)\(/g, function(v) {
		return "<span class='prop'>" + v.substr(0, v.length - 1) + "</span>(";
	});

	//strings
	code = code.replace(/(\"(\\.|[^\"])*\")/g, function(v) {
		return "<span class='str'>" + v + "</span>";
	});

	//comments 
	code = code.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, function(v) { ///(\/\/[a-zA-Z0-9\?\!\(\)_ ]*)/g
		return "<span class='cmnt'>" + v.replace(/<[^>]*>/g, "") + "</span>";
	});


	if(!skip_css)
		code = "<style>.obj { color: #79B; } .prop { color: #B97; }	.str,.num { color: #A79; } .cmnt { color: #798; } .rsv { color: #9AB; } </style>" + code;

	return code;
}

function beautifyJSON( code, skip_css )
{
	if(typeof(code) == "object")
		code = JSON.stringify(code);

	var reserved = ["false", "true", "null"];

	//reserved words
	code = code.replace(/(\w+)/g, function(v) {
		if(reserved.indexOf(v) != -1)
			return "<span class='rsv'>" + v + "</span>";
		return v;
	});


	//numbers
	code = code.replace(/([0-9]+)/g, function(v) {
		return "<span class='num'>" + v + "</span>";
	});

	//obj.method
	code = code.replace(/(\w+\.\w+)/g, function(v) {
		var t = v.split(".");
		return "<span class='obj'>" + t[0] + "</span>.<span class='prop'>" + t[1] + "</span>";
	});

	//strings
	code = code.replace(/(\"(\\.|[^\"])*\")/g, function(v) {
		return "<span class='str'>" + v + "</span>";
	});

	//comments
	code = code.replace(/(\/\/[a-zA-Z0-9\?\!\(\)_ ]*)/g, function(v) {
		return "<span class='cmnt'>" + v + "</span>";
	});

	if(!skip_css)
		code = "<style>.obj { color: #79B; } .prop { color: #B97; }	.str { color: #A79; } .num { color: #B97; } .cmnt { color: #798; } .rsv { color: #9AB; } </style>" + code;

	return code;
}

function dataURItoBlob( dataURI ) {
	var pos = dataURI.indexOf(",");
	//convert to binary
    var byteString = atob( dataURI.substr(pos+1) ); 
	//copy from string to array
    var ab = new ArrayBuffer( byteString.length ); 
    var ia = new Uint8Array(ab);
	var l = byteString.length;
    for (var i = 0; i < l; i++) {
        ia[i] = byteString.charCodeAt(i);
    }

	var mime = dataURI.substr(5,pos-5);
	mime = mime.substr(0, mime.length - 7); //strip ";base64"
    return new Blob([ab], { type: mime });
}
//enclose in a scope
(function(){


function Button( value, options )
{
	options = options || {};

	if(typeof(options) === "function")
		options = { callback: options };

	var that = this;
	var element = document.createElement("div");
	element.className = "litegui button";

	this.root = element;
	var button = document.createElement("button");
	button.className = "litebutton";
	this.content = button;
	element.appendChild(button);

	button.innerHTML = value;		
	button.addEventListener("click", function(e) { 
		that.click();
	});

	this.click = function()
	{
		if(options.callback)
			options.callback.call(that);
	}
}

LiteGUI.Button = Button;

/**
* SearchBox 
*
* @class SearchBox
* @constructor
* @param {*} value
* @param {Object} options
*/

function SearchBox( value, options )
{
	options = options || {};
	value = value || "";
	var element = document.createElement("div");
	element.className = "litegui searchbox";
	var placeholder = (options.placeholder != null ? options.placeholder : "Search");
	element.innerHTML = "<input value='"+value+"' placeholder='"+ placeholder +"'/>";
	this.input = element.querySelector("input");
	this.root = element;
	var that = this;

	this.input.onchange = function(e) { 
		var value = e.target.value;
		if(options.callback)
			options.callback.call(that,value);
	};
}

SearchBox.prototype.setValue = function(v) { this.input.value = v; this.input.onchange(); };
SearchBox.prototype.getValue = function() { return this.input.value; };

LiteGUI.SearchBox = SearchBox;


/**
* ContextMenu 
*
* @class ContextMenu 
* @constructor
* @param {Array} values (allows object { title: "Nice text", callback: function ... })
* @param {Object} options [optional] Some options:\
* - title: title to show on top of the menu
* - callback: function to call when an option is clicked, it receives the item information
* - ignore_item_callbacks: ignores the callback inside the item, it just calls the options.callback 
* - event: you can pass a MouseEvent, this way the ContextMenu appears in that position
*/
function ContextMenu( values, options )
{
	options = options || {};
	this.options = options;
	var that = this;

	//to link a menu with its parent
	if(options.parentMenu)
	{
		if( options.parentMenu.constructor !== this.constructor )
		{
			console.error("parentMenu must be of class ContextMenu, ignoring it");
			options.parentMenu = null;
		}
		else
		{
			this.parentMenu = options.parentMenu;
			this.parentMenu.lock = true;
			this.parentMenu.current_submenu = this;
		}
	}

	if( options.event && options.event.constructor.name !== "MouseEvent" && options.event.constructor.name !== "PointerEvent" && options.event.constructor.name !== "CustomEvent" )
	{
		console.error("Event passed to ContextMenu is not of type MouseEvent or CustomEvent. Ignoring it.");
		options.event = null;
	}

	var root = document.createElement("div");
	root.className = "litecontextmenu litemenubar-panel";
	root.style.minWidth = 100;
	root.style.minHeight = 100;
	root.style.pointerEvents = "none";
	setTimeout( function() { root.style.pointerEvents = "auto"; },100); //delay so the mouse up event is not caugh by this element

	//this prevents the default context browser menu to open in case this menu was created when pressing right button 
	root.addEventListener("mouseup", function(e){ 
		e.preventDefault(); return true; 
	}, true);
	root.addEventListener("contextmenu", function(e) { 
		if(e.button != 2) //right button
			return false;
		e.preventDefault(); 
		return false;
	},true);

	root.addEventListener("mousedown", function(e){ 
		if(e.button == 2)
		{
			that.close();
			e.preventDefault(); return true; 
		}
	}, true);


	this.root = root;

	//title
	if(options.title)
	{
		var element = document.createElement("div");
		element.className = "litemenu-title";
		element.innerHTML = options.title;
		root.appendChild(element);
	}

	//entries
	var num = 0;
	for(var i in values)
	{
		var name = values.constructor == Array ? values[i] : i;
		if( name != null && name.constructor !== String )
			name = name.content === undefined ? String(name) : name.content;
		var value = values[i];
		this.addItem( name, value, options );
		num++;
	}

	//close on leave
	root.addEventListener("mouseleave", function(e) {
		if(that.lock)
			return;
		if(root.closing_timer)
			clearTimeout( root.closing_timer );
		root.closing_timer = setTimeout( that.close.bind(that, e), 500 );
		//that.close(e);
	});

	root.addEventListener("mouseenter", function(e) {
		if(root.closing_timer)
			clearTimeout( root.closing_timer );
	});

	function on_mouse_wheel(e)
	{
		var pos = parseInt( root.style.top );
		root.style.top = (pos + e.deltaY * 0.1).toFixed() + "px";
		e.preventDefault();
		return true;
	}

	root.addEventListener("wheel", on_mouse_wheel, true);
	root.addEventListener("mousewheel", on_mouse_wheel, true);


	//insert before checking position
	var root_document = document;
	if(options.event)
		root_document = options.event.target.ownerDocument; 

	if(!root_document)
		root_document = document;
	root_document.body.appendChild(root);

	//compute best position
	var left = options.left || 0;
	var top = options.top || 0;
	if(options.event)
	{
		if( options.event.constructor.name !== "MouseEvent" && options.event.constructor.name !== "PointerEvent" && options.event.constructor.name !== "CustomEvent" )
		{
			console.warn("Event passed to ContextMenu is not of type MouseEvent");
			options.event = null;
		}
		else
		{
			left = (options.event.pageX - 10);
			top = (options.event.pageY - 10);
			if(options.title)
				top -= 20;

			if(options.parentMenu)
			{
				var rect = options.parentMenu.root.getBoundingClientRect();
				left = rect.left + rect.width;
			}

			var body_rect = document.body.getBoundingClientRect();
			var root_rect = root.getBoundingClientRect();

			if(left > (body_rect.width - root_rect.width - 10))
				left = (body_rect.width - root_rect.width - 10);
			if(top > (body_rect.height - root_rect.height - 10))
				top = (body_rect.height - root_rect.height - 10);
		}
	}

	root.style.left = left + "px";
	root.style.top = top  + "px";
}

ContextMenu.prototype.addItem = function( name, value, options )
{
	var that = this;
	options = options || {};

	var element = document.createElement("div");
	element.className = "litemenu-entry submenu";

	var disabled = false;

	if(value === null)
	{
		element.classList.add("separator");
		//element.innerHTML = "<hr/>"
		//continue;
	}
	else
	{
		element.innerHTML = value && value.title ? value.title : name;
		element.value = value;

		if(value)
		{
			if(value.disabled)
			{
				disabled = true;
				element.classList.add("disabled");
			}
			if(value.submenu || value.has_submenu)
				element.classList.add("has_submenu");
		}

		if(typeof(value) == "function")
		{
			element.dataset["value"] = name;
			element.onclick_callback = value;
		}
		else
			element.dataset["value"] = value;
	}

	this.root.appendChild(element);
	if(!disabled)
		element.addEventListener("click", inner_onclick);
	if(options.autoopen)
		element.addEventListener("mouseenter", inner_over);

	function inner_over(e)
	{
		var value = this.value;
		if(!value || !value.has_submenu)
			return;
		inner_onclick.call(this,e);
	}

	//menu option clicked
	function inner_onclick(e) {
		var value = this.value;
		var close_parent = true;

		if(that.current_submenu)
			that.current_submenu.close(e);

		//global callback
		if(options.callback) 
		{
			var r = options.callback.call(that, value, options, e );
			if(r === true)
				close_parent = false;
		}

		//special cases
		if(value)
		{
			if (value.callback && !options.ignore_item_callbacks && value.disabled !== true )  //item callback
			{
				var r = value.callback.call( this, value, options, e, that );
				if(r === true)
					close_parent = false;
			}
			if(value.submenu)
			{
				if(!value.submenu.options)
					throw("ContextMenu submenu needs options");
				var submenu = new LiteGUI.ContextMenu( value.submenu.options, {
					callback: value.submenu.callback,
					event: e,
					parentMenu: that,
					ignore_item_callbacks: value.submenu.ignore_item_callbacks,
					title: value.submenu.title,
					autoopen: options.autoopen
				});
				close_parent = false;
			}
		}
	
		if(close_parent && !that.lock)
			that.close();
	}

	return element;
}

ContextMenu.prototype.close = function(e, ignore_parent_menu)
{
	if(this.root.parentNode)
		this.root.parentNode.removeChild( this.root );
	if(this.parentMenu && !ignore_parent_menu)
	{
		this.parentMenu.lock = false;
		this.parentMenu.current_submenu = null;
		if( e === undefined )
			this.parentMenu.close();
		else if( e && !LiteGUI.isCursorOverElement( e, this.parentMenu.root) )
			LiteGUI.trigger( this.parentMenu.root, "mouseleave", e );
	}
	if(this.current_submenu)
		this.current_submenu.close(e, true);
	if(this.root.closing_timer)
		clearTimeout( this.root.closing_timer );
}

//returns the top most menu
ContextMenu.prototype.getTopMenu = function()
{
	if( this.options.parentMenu )
		return this.options.parentMenu.getTopMenu();
	return this;
}

ContextMenu.prototype.getFirstEvent = function()
{
	if( this.options.parentMenu )
		return this.options.parentMenu.getFirstEvent();
	return this.options.event;
}

LiteGUI.ContextMenu = ContextMenu;
LiteGUI.ContextualMenu = ContextMenu; //LEGACY: REMOVE


function Checkbox( value, on_change)
{
	var that = this;
	this.value = value;

	var root = this.root = document.createElement("span");
	root.className = "litecheckbox inputfield";
	root.dataset["value"] = value;

	var element = this.element = document.createElement("span");
	element.className = "fixed flag checkbox "+(value ? "on" : "off");
	root.appendChild( element );
	
	root.addEventListener("click", onClick.bind(this) );

	function onClick(e) {
		this.setValue( this.root.dataset["value"] != "true" );
		e.preventDefault();
		e.stopPropagation();
	}

	this.setValue = function(v)
	{
		if(this.value === v)
			return;

		if( this.root.dataset["value"] == v.toString())
			return;

		this.root.dataset["value"] = v;
		if(v)
		{
			this.element.classList.remove("off");
			this.element.classList.add("on");
		}
		else
		{
			this.element.classList.remove("on");
			this.element.classList.add("off");
		}
		var old_value = this.value;
		this.value = v;

		if(on_change)
			on_change( v, old_value );
	}

	this.getValue = function()
	{
		return this.value;
		//return this.root.dataset["value"] == "true";
	}
}	

LiteGUI.Checkbox = Checkbox;


//the tiny box to expand the children of a node
function createLitebox(state, on_change)
{
	var element = document.createElement("span");
	element.className = "listbox " + (state ? "listopen" : "listclosed");
	element.innerHTML = state ? "&#9660;" : "&#9658;";
	element.dataset["value"] = state ? "open" : "closed";
	element.addEventListener("click", onClick );
	element.on_change_callback = on_change;

	element.setEmpty = function(v)
	{
		if(v)
			this.classList.add("empty");
		else
			this.classList.remove("empty");
	}

	element.expand = function()
	{
		this.setValue(true);
	}

	element.collapse = function()
	{
		this.setValue(false);
	}

	element.setValue = function(v)
	{
		if(this.dataset["value"] == (v ? "open" : "closed"))
			return;

		if(!v)
		{
			this.dataset["value"] = "closed";
			this.innerHTML = "&#9658;";
			this.classList.remove("listopen");
			this.classList.add("listclosed");
		}
		else
		{
			this.dataset["value"] = "open";
			this.innerHTML = "&#9660;";
			this.classList.add("listopen");
			this.classList.remove("listclosed");
		}

		if(on_change)
			on_change( this.dataset["value"] );
	}

	element.getValue = function()
	{
		return this.dataset["value"];
	}

	function onClick(e) {
		//console.log("CLICK");
		var box = e.target;
		box.setValue( this.dataset["value"] == "open" ? false : true );
		if(this.stopPropagation)
			e.stopPropagation();
	}

	return element;
}	

LiteGUI.createLitebox = createLitebox;

/**
* List 
*
* @class List
* @constructor
* @param {String} id
* @param {Array} values
* @param {Object} options
*/
function List( id, items, options )
{
	options = options || {};

	var root = this.root = document.createElement("ul");
	root.id = id;
	root.className = "litelist";
	this.items = [];
	var that = this;

	this.callback = options.callback;

	//walk over every item in the list
	for(var i in items)
	{
		var item = document.createElement("li");
		item.className = "list-item";
		item.data = items[i];
		item.dataset["value"] = items[i];

		var content = "";
		if(typeof(items[i]) == "string")
			content = items[i] + "<span class='arrow'></span>";
		else
		{
			content = (items[i].name || items[i].title || "") + "<span class='arrow'></span>";
			if(items[i].id)
				item.id = items[i].id;
		}
		item.innerHTML = content;

		item.addEventListener("click", function() {

			var list = root.querySelectorAll(".list-item.selected");
			for(var j = 0; j < list.length; ++j)
				list[j].classList.remove("selected");
			this.classList.add("selected");
			LiteGUI.trigger( that.root, "wchanged", this );
			if(that.callback)
				that.callback( this.data  );
		});

		root.appendChild(item);
	}


	if(options.parent)
	{
		if(options.parent.root)
			options.parent.root.appendChild( root );
		else
			options.parent.appendChild( root );
	}
}

List.prototype.getSelectedItem = function()
{
	return this.root.querySelector(".list-item.selected");
}

List.prototype.setSelectedItem = function( name )
{
	var items = this.root.querySelectorAll(".list-item");
	for(var i = 0; i < items.length; i++)
	{
		var item = items[i];
		if(item.data == name)
		{
			LiteGUI.trigger( item, "click" );
			break;
		}
	}
}

LiteGUI.List = List;

/**
* Slider 
*
* @class Slider
* @constructor
* @param {Number} value
* @param {Object} options
*/
function Slider(value, options)
{
	options = options || {};
	var root = this.root = document.createElement("div");
	var that = this;
	this.value = value;
	root.className = "liteslider";

	this.setValue = function(value, skip_event)
	{
		//var width = canvas.getClientRects()[0].width;
		var min = options.min || 0.0;
		var max = options.max || 1.0;
		if(value < min) value = min;
		else if(value > max) value = max;
		var range = max - min;
		var norm = (value - min) / range;
		var percentage = (norm*100).toFixed(1) + "%";
		var percentage2 = (norm*100+2).toFixed(1) + "%";
		root.style.background = "linear-gradient(to right, #999 " + percentage + ", #FC0 "+percentage2+", #333 " + percentage2 + ")";

		if(value != this.value)
		{
			this.value = value;
			if(!skip_event)
			{
				LiteGUI.trigger(this.root, "change", value );
				if(this.onChange)
					this.onChange( value );
			}
		}
	}

	function setFromX(x)
	{
		var rect = root.getBoundingClientRect();
		if(!rect)
			return;
		var width = rect.width;
		var norm = x / width;
		var min = options.min || 0.0;
		var max = options.max || 1.0;
		var range = max - min;
		that.setValue( range * norm + min );
	}

	var doc_binded = null;

	root.addEventListener("mousedown", function(e) {
		var mouseX, mouseY;
		if(e.offsetX) { mouseX = e.offsetX; mouseY = e.offsetY; }
		else if(e.layerX) { mouseX = e.layerX; mouseY = e.layerY; }	
		setFromX(mouseX);
		doc_binded = root.ownerDocument;
		doc_binded.addEventListener("mousemove", onMouseMove );
		doc_binded.addEventListener("mouseup", onMouseUp );
		e.preventDefault();
		e.stopPropagation();
	});

	function onMouseMove(e)
	{
		var rect = root.getBoundingClientRect();
		if(!rect)
			return;
		var x = e.x === undefined ? e.pageX : e.x;
		var mouseX = x - rect.left;
		setFromX(mouseX);
		e.preventDefault();
		return false;
	}

	function onMouseUp(e)
	{
		var doc = doc_binded || document;
		doc_binded = null;
		doc.removeEventListener("mousemove", onMouseMove );
		doc.removeEventListener("mouseup", onMouseUp );
		e.preventDefault();
		return false;
	}

	this.setValue(value);
}

LiteGUI.Slider = Slider;

/**
* LineEditor 
*
* @class LineEditor
* @constructor
* @param {Number} value
* @param {Object} options
*/

function LineEditor(value, options)
{
	options = options || {};
	var element = document.createElement("div");
	element.className = "curve " + (options.extraclass ? options.extraclass : "");
	element.style.minHeight = "50px";
	element.style.width = options.width || "100%";

	element.bgcolor = options.bgcolor || "#222";
	element.pointscolor = options.pointscolor || "#5AF";
	element.linecolor = options.linecolor || "#444";

	element.value = value || [];
	element.xrange = options.xrange || [0,1]; //min,max
	element.yrange = options.yrange || [0,1]; //min,max
	element.defaulty = options.defaulty != null ? options.defaulty : 0.5;
	element.no_trespassing = options.no_trespassing || false;
	element.show_samples = options.show_samples || 0;
	element.options = options;
	element.style.minWidth = "50px";
	element.style.minHeight = "20px";

	var canvas = document.createElement("canvas");
	canvas.width = options.width || 200;
	canvas.height = options.height || 50;
	element.appendChild( canvas );
	element.canvas = canvas;

	element.addEventListener("mousedown",onmousedown);

	element.getValueAt = function(x)
	{
		if(x < element.xrange[0] || x > element.xrange[1])
			return element.defaulty;

		var last = [ element.xrange[0], element.defaulty ];
		var f = 0;
		for(var i = 0; i < element.value.length; i += 1)
		{
			var v = element.value[i];
			if(x == v[0]) return v[1];
			if(x < v[0])
			{
				f = (x - last[0]) / (v[0] - last[0]);
				return last[1] * (1-f) + v[1] * f;
			}
			last = v;
		}

		v = [ element.xrange[1], element.defaulty ];
		f = (x - last[0]) / (v[0] - last[0]);
		return last[1] * (1-f) + v[1] * f;
	}

	element.resample = function(samples)
	{
		var r = [];
		var dx = (element.xrange[1] - element.xrange[0]) / samples;
		for(var i = element.xrange[0]; i <= element.xrange[1]; i += dx)
		{
			r.push( element.getValueAt(i) );
		}
		return r;
	}

	element.addValue = function(v)
	{
		for(var i = 0; i < element.value; i++)
		{
			var value = element.value[i];
			if(value[0] < v[0]) continue;
			element.value.splice(i,0,v);
			redraw();
			return;
		}

		element.value.push(v);
		redraw();
	}

	//value to canvas
	function convert(v)
	{
		return [ canvas.width * ( (element.xrange[1] - element.xrange[0]) * v[0] + element.xrange[0]),
			canvas.height * ((element.yrange[1] - element.yrange[0]) * v[1] + element.yrange[0])];
	}

	//canvas to value
	function unconvert(v)
	{
		return [(v[0] / canvas.width - element.xrange[0]) / (element.xrange[1] - element.xrange[0]),
				(v[1] / canvas.height - element.yrange[0]) / (element.yrange[1] - element.yrange[0])];
	}

	var selected = -1;

	element.redraw = function()
	{
		var rect = canvas.parentNode.getBoundingClientRect();
		if(rect && canvas.width != rect.width && rect.width && rect.width < 1000)
			canvas.width = rect.width;
		if(rect && canvas.height != rect.height && rect.height && rect.height < 1000)
			canvas.height = rect.height;

		var ctx = canvas.getContext("2d");
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.translate(0,canvas.height);
		ctx.scale(1,-1);

		ctx.fillStyle = element.bgcolor;
		ctx.fillRect(0,0,canvas.width,canvas.height);

		ctx.strokeStyle = element.linecolor;
		ctx.beginPath();

		//draw line
		var pos = convert([element.xrange[0],element.defaulty]);
		ctx.moveTo( pos[0], pos[1] );

		for(var i in element.value)
		{
			var value = element.value[i];
			pos = convert(value);
			ctx.lineTo( pos[0], pos[1] );
		}

		pos = convert([element.xrange[1],element.defaulty]);
		ctx.lineTo( pos[0], pos[1] );
		ctx.stroke();

		//draw points
		for(var i = 0; i < element.value.length; i += 1)
		{
			var value = element.value[i];
			pos = convert(value);
			if(selected == i)
				ctx.fillStyle = "white";
			else
				ctx.fillStyle = element.pointscolor;
			ctx.beginPath();
			ctx.arc( pos[0], pos[1], selected == i ? 4 : 2, 0, Math.PI * 2);
			ctx.fill();
		}

		if(element.show_samples)
		{
			var samples = element.resample(element.show_samples);
			ctx.fillStyle = "#888";
			for(var i = 0; i < samples.length; i += 1)
			{
				var value = [ i * ((element.xrange[1] - element.xrange[0]) / element.show_samples) + element.xrange[0], samples[i] ];
				pos = convert(value);
				ctx.beginPath();
				ctx.arc( pos[0], pos[1], 2, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}

	var last_mouse = [0,0];
	function onmousedown(evt)
	{
		document.addEventListener("mousemove",onmousemove);
		document.addEventListener("mouseup",onmouseup);

		var rect = canvas.getBoundingClientRect();
		var mousex = evt.clientX - rect.left;
		var mousey = evt.clientY - rect.top;

		selected = computeSelected(mousex,canvas.height-mousey);

		if(selected == -1)
		{
			var v = unconvert([mousex,canvas.height-mousey]);
			element.value.push(v);
			sortValues();
			selected = element.value.indexOf(v);
		}

		last_mouse = [mousex,mousey];
		element.redraw();
		evt.preventDefault();
		evt.stopPropagation();
	}

	function onmousemove(evt)
	{
		var rect = canvas.getBoundingClientRect();
		var mousex = evt.clientX - rect.left;
		var mousey = evt.clientY - rect.top;

		if(mousex < 0) mousex = 0;
		else if(mousex > canvas.width) mousex = canvas.width;
		if(mousey < 0) mousey = 0;
		else if(mousey > canvas.height) mousey = canvas.height;

		//dragging to remove
		if( selected != -1 && distance( [evt.clientX - rect.left, evt.clientY - rect.top], [mousex,mousey] ) > canvas.height * 0.5 )
		{
			element.value.splice(selected,1);
			onmouseup(evt);
			return;
		}

		var dx = last_mouse[0] - mousex;
		var dy = last_mouse[1] - mousey;
		var delta = unconvert([-dx,dy]);
		if(selected != -1)
		{
			var minx = element.xrange[0];
			var maxx = element.xrange[1];

			if(element.no_trespassing)
			{
				if(selected > 0) minx = element.value[selected-1][0];
				if(selected < (element.value.length-1) ) maxx = element.value[selected+1][0];
			}

			var v = element.value[selected];
			v[0] += delta[0];
			v[1] += delta[1];
			if(v[0] < minx) v[0] = minx;
			else if(v[0] > maxx) v[0] = maxx;
			if(v[1] < element.yrange[0]) v[1] = element.yrange[0];
			else if(v[1] > element.yrange[1]) v[1] = element.yrange[1];
		}

		sortValues();
		element.redraw();
		last_mouse[0] = mousex;
		last_mouse[1] = mousey;
		onchange();

		evt.preventDefault();
		evt.stopPropagation();
	}

	function onmouseup(evt)
	{
		selected = -1;
		element.redraw();
		document.removeEventListener("mousemove",onmousemove);
		document.removeEventListener("mouseup",onmouseup);
		onchange();
		evt.preventDefault();
		evt.stopPropagation();
	}

	function onresize(e)
	{
		element.redraw();
	}
	
	function onchange()
	{
		if(options.callback)
			options.callback.call(element,element.value);
		else
			LiteGUI.trigger(element,"change");
	}

	function distance(a,b) { return Math.sqrt( Math.pow(b[0]-a[0],2) + Math.pow(b[1]-a[1],2) ); };

	function computeSelected(x,y)
	{
		var min_dist = 100000;
		var max_dist = 8; //pixels
		var selected = -1;
		for(var i=0; i < element.value.length; i++)
		{
			var value = element.value[i];
			var pos = convert(value);
			var dist = distance([x,y],pos);
			if(dist < min_dist && dist < max_dist)
			{
				min_dist = dist;
				selected = i;
			}
		}
		return selected;
	}

	function sortValues()
	{
		var v = null;
		if(selected != -1)
			v = element.value[selected];
		element.value.sort(function(a,b) { return a[0] - b[0]; });
		if(v)
			selected = element.value.indexOf(v);
	}
	
	element.redraw();
	return element;
}

LiteGUI.LineEditor = LineEditor;


function ComplexList( options )
{
	options = options || {};

	this.root = document.createElement("div");
	this.root.className = "litecomplexlist";

	this.item_code = options.item_code || "<div class='listitem'><span class='tick'><span>"+LiteGUI.special_codes.tick+"</span></span><span class='title'></span><button class='trash'>"+LiteGUI.special_codes.close+"</button></div>";

	if(options.height)
		this.root.style.height = LiteGUI.sizeToCSS( options.height );

	this.selected = null;
	this.onItemSelected = null;
	this.onItemToggled = null;
	this.onItemRemoved = null;
}

ComplexList.prototype.addTitle = function( text )
{
	var elem = LiteGUI.createElement("div",".listtitle",text);
	this.root.appendChild( elem );
	return elem;
}

ComplexList.prototype.addHTML = function( html, on_click )
{
	var elem = LiteGUI.createElement("div",".listtext", html );
	if(on_click)
		elem.addEventListener("mousedown", on_click);
	this.root.appendChild( elem );
	return elem;
}

ComplexList.prototype.clear = function()
{
	this.root.innerHTML = "";
}

ComplexList.prototype.addItem = function( item, text, is_enabled, can_be_removed )
{
	var title = text || item.content || item.name;
	var elem = LiteGUI.createListItem( this.item_code, { ".title": title } );
	elem.item = item;

	if(is_enabled)
		elem.classList.add("enabled");

	if(!can_be_removed)
		elem.querySelector(".trash").style.display = "none";

	var that = this;
	elem.addEventListener("mousedown", function(e){
		e.preventDefault();
		this.setSelected(true);
		if(that.onItemSelected)
			that.onItemSelected( item, elem );
	});
	elem.querySelector(".tick").addEventListener("mousedown",  function(e){
		e.preventDefault();
		elem.classList.toggle("enabled");
		if(that.onItemToggled)
			that.onItemToggled( item, elem, elem.classList.contains("enabled"));
	});

	elem.querySelector(".trash").addEventListener("mousedown",function(e){
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();
		if(that.onItemRemoved)
			that.onItemRemoved( item, elem );
	});

	elem.setContent = function(v, is_html){
		if(is_html)
			elem.querySelector(".title").innerHTML = v;
		else
			elem.querySelector(".title").innerText = v;
	}

	elem.toggleEnabled = function(v){
		elem.classList.toggle("enabled");
	}

	elem.setSelected = function(v)
	{
		LiteGUI.removeClass( that.root, "selected" );
		if(v)
			this.classList.add("selected");
		else
			this.classList.remove("selected");
		that.selected = elem.item;
	}

	elem.show = function() { this.style.display = ""; }
	elem.hide = function() { this.style.display = "none"; }

	this.root.appendChild( elem );
	return elem;
}

LiteGUI.ComplexList = ComplexList;





})();
//enclose in a scope
(function(){

function Console( options )
{
	options = options || {};

	this.root = document.createElement("div");
	this.root.className = "liteconsole";
	this.root.innerHTML = "<div class='log'></div><div class='foot'><input type='text'/></div>";

	this.log_element = this.root.querySelector('.log');
	this.input = this.root.querySelector('input');

	this.input.addEventListener("keydown", this.processKeyDown.bind(this) );
	this._prompt = options.prompt || "]";

	this.onAutocomplete = null; //receives string, must return final string
	this.onProcessCommand = null; //receives input value

	this.history = [];
	this._history_offset = 0;
}

Console.prototype.processKeyDown = function(e)
{
	if(this._input_blocked)
		return;

	if(e.keyCode == 13) //return and exec
	{
		var value = this.input.value;
		var cmd = value.trim();
		this.addMessage( this._prompt + cmd, "me",true);
		this.input.value = "";
		this.history.push(cmd);
		if(this.history.length > 10)
			this.history.shift();
		if( this.onProcessCommand )
			this.onProcessCommand( cmd );
		this._history_offset = 0;
	}
	else if(e.keyCode == 38 || e.keyCode == 40) //up & down history
	{
		this._history_offset += (e.keyCode == 38 ? -1 : 1);
		if(this._history_offset > 0)
			this._history_offset = 0;
		else if(this._history_offset < -this.history.length)
			this._history_offset = -this.history.length;
		var pos = this.history.length + this._history_offset;
		if(pos < 0)
			return;
		if( pos >= this.history.length)
			this.input.value = "";
		else
			this.input.value = this.history[ pos ];
	}
	else if(e.keyCode == 9) //tab autocompletion
	{
		if(this.onAutocomplete)
			this.input.value = this.onAutocomplete( this.input.value );
		else
			return;
	}
	else
		return;
	e.preventDefault();
	e.stopPropagation();
}

Console.prototype.addMessage = function(text,className,as_text)
{
	var content = this.log_element;
	var element = null; //contains the last message sent

	if(text && text.constructor === Array)
	{
		for( var i = 0; i < text.length; ++i )
			add( text[i] );
	}
	else if(text && text.constructor === Object)
	{
		add( JSON.stringify(text,null,""), this );
	}
	else
		add( text, this );

	function add(txt, con)
	{
		element = document.createElement("pre");
		if(as_text)
			element.innerText = txt;
		else
			element.innerHTML = txt;
		element.className = "msg";
		if(className)
			element.className += " " + className;
		content.appendChild(element);
		if( content.children.length > 1000 )
			content.removeChild( content.children[0] );
	}

	this.log_element.scrollTop = 1000000;
	element.update = function(v)
	{
		this.innerHTML = v;
	}

	return element;
}

Console.prototype.log = function()
{
	var args = Array.prototype.slice.call(arguments);
	var d = args.join(",");
	return this.addMessage( d, "msglog" );
}

Console.prototype.warn = function()
{
	var args = Array.prototype.slice.call(arguments);
	var d = args.join(",");
	return this.addMessage( d, "msgwarn" );
}

Console.prototype.error = function()
{
	var args = Array.prototype.slice.call(arguments);
	var d = args.join(",");
	return this.addMessage( d, "msgerror" );
}

Console.prototype.clear = function()
{
	this.log_element.innerHTML = "";
}

LiteGUI.Console = Console;





})();
//enclose in a scope
(function(){

	
	/****************** AREA **************/
	/** An Area is am streched container.
	* Areas can be split several times horizontally or vertically to fit different colums or rows
	*
	* @class Area
	* @constructor
	* @param {Object} options
	*/
	function Area( options, legacy )
	{
		//for legacy code
		if( (options && options.constructor === String) || legacy )
		{
			var id = options;
			options = legacy || {};
			options.id = id;
			console.warn("LiteGUI.Area legacy parameter, use options as first parameter instead of id.");
		}

		options = options || {};
		/* the root element containing all sections */
		var root = document.createElement("div");
		root.className = "litearea";
		if(options.id)
			root.id = options.id;
		if(options.className)
			root.className +=  " " + options.className;

		this.root = root;
		this.root.litearea = this; //dbl link

		var width = options.width || "100%";
		var height = options.height || "100%";

		if( width < 0 )
			width = 'calc( 100% - '+Math.abs(width)+'px)';
		if( height < 0 )
			height = 'calc( 100% - '+ Math.abs(height)+'px)';

		root.style.width = width;
		root.style.height = height;

		this.options = options;

		var that = this;
		this._computed_size = [ this.root.offsetWidth, this.root.offserHeight ];

		var content = document.createElement("div");
		if(options.content_id)
			content.id = options.content_id;
		content.className = "liteareacontent";
		content.style.width = "100%";
		content.style.height = "100%";
		this.root.appendChild( content );
		this.content = content;

		this.split_direction = "none";
		this.sections = [];

		if(options.autoresize)
			LiteGUI.bind( LiteGUI, "resized", function() { 
				that.onResize(); 
			});
	}

	Area.VERTICAL = "vertical";
	Area.HORIZONTAL = "horizontal";

	Area.splitbar_size = 4;

	/* get container of the section */
	Area.prototype.getSection = function(num)
	{
		num = num || 0;
		if(this.sections.length > num)
			return this.sections[num];
		return null;
	}

	Area.prototype.onResize = function(e)
	{
		var computed_size = [ this.root.offsetWidth, this.root.offsetHeight ];
		if( e && this._computed_size && computed_size[0] == this._computed_size[0] && computed_size[1] == this._computed_size[1])
			return;

		this.sendResizeEvent(e);
	}

	//sends the resize event to all the sections
	Area.prototype.sendResizeEvent = function(e)
	{
		if(this.sections.length)
			for(var i in this.sections)
			{
				var section = this.sections[i];
				section.onResize(e);
			}
		else //send it to the children
		{
			for (var j = 0; j < this.root.childNodes.length; j++)
			{
				var element = this.root.childNodes[j];
				if(element.litearea)
					element.litearea.onResize();
				else
					LiteGUI.trigger( element, "resize" );
			}
		}

		//inner callback
		if( this.onresize )
			this.onresize();
	}

	Area.prototype.getWidth = function()
	{
		return this.root.offsetWidth;
	}

	Area.prototype.getHeight = function()
	{
		return this.root.offsetHeight;
	}

	Area.prototype.isVisible = function()
	{
		return this.root.style.display != "none";	
	}

	Area.prototype.adjustHeight = function()
	{
		if(!this.root.parentNode)
		{
			console.error("Cannot adjust height of LiteGUI.Area without parent");
			return;
		}

		//check parent height
		var h = this.root.parentNode.offsetHeight;

		//check position
		var y = this.root.getClientRects()[0].top;

		//adjust height
		this.root.style.height = "calc( 100% - " + y + "px )";
	}

	Area.prototype.split = function( direction, sizes, editable )
	{
		if( !direction || direction.constructor !== String )
			throw ("First parameter must be a string: 'vertical' or 'horizontal'");

		if( !sizes )
			sizes = ["50%",null];

		if( direction != "vertical" && direction != "horizontal" )
			throw ("First parameter must be a string: 'vertical' or 'horizontal'");

		if(this.sections.length)
			throw "cannot split twice";

		//create areas
		var area1 = new LiteGUI.Area({ content_id: this.content.id });
		area1.root.style.display = "inline-block";
		var area2 = new LiteGUI.Area();
		area2.root.style.display = "inline-block";

		var splitinfo = "";
		var splitbar = null;
		var dynamic_section = null;
		if(editable)
		{
			splitinfo = " - " + (Area.splitbar_size + 2) +"px"; //2 px margin ¿?
			splitbar = document.createElement("div");
			splitbar.className = "litesplitbar " + direction;
			if(direction == "vertical")
				splitbar.style.height = Area.splitbar_size + "px";
			else
				splitbar.style.width = Area.splitbar_size + "px";
			this.splitbar = splitbar;
			splitbar.addEventListener("mousedown", inner_mousedown);
		}

		sizes = sizes || ["50%",null];

		if(direction == "vertical")
		{
			area1.root.style.width = "100%";
			area2.root.style.width = "100%";

			if(sizes[0] == null)
			{
				var h = sizes[1];
				if(typeof(h) == "number")
					h = sizes[1] + "px";

				area1.root.style.height = "-moz-calc( 100% - " + h + splitinfo + " )";
				area1.root.style.height = "-webkit-calc( 100% - " + h + splitinfo + " )";
				area1.root.style.height = "calc( 100% - " + h + splitinfo + " )";
				area2.root.style.height = h;
				area2.size = h;
				dynamic_section = area1;
			}
			else if(sizes[1] == null)
			{
				var h = sizes[0];
				if(typeof(h) == "number")
					h = sizes[0] + "px";

				area1.root.style.height = h;
				area1.size = h;
				area2.root.style.height = "-moz-calc( 100% - " + h + splitinfo + " )";
				area2.root.style.height = "-webkit-calc( 100% - " + h + splitinfo + " )";
				area2.root.style.height = "calc( 100% - " + h + splitinfo + " )";
				dynamic_section = area2;
			}
			else
			{
				var h1 = sizes[0];
				if(typeof(h1) == "number")
					h1 = sizes[0] + "px";
				var h2 = sizes[1];
				if(typeof(h2) == "number")
					h2 = sizes[1] + "px";
				area1.root.style.height = h1;
				area1.size = h1;
				area2.root.style.height = h2;
				area2.size = h2;
			}
		}
		else //horizontal
		{
			area1.root.style.height = "100%";
			area2.root.style.height = "100%";

			if(sizes[0] == null)
			{
				var w = sizes[1];
				if(typeof(w) == "number")
					w = sizes[1] + "px";
				area1.root.style.width = "-moz-calc( 100% - " + w + splitinfo + " )";
				area1.root.style.width = "-webkit-calc( 100% - " + w + splitinfo + " )";
				area1.root.style.width = "calc( 100% - " + w + splitinfo + " )";
				area2.root.style.width = w;
				area2.size = sizes[1];
				dynamic_section = area1;
			}
			else if(sizes[1] == null)
			{
				var w = sizes[0];
				if(typeof(w) == "number")
					w = sizes[0] + "px";

				area1.root.style.width = w;
				area1.size = w;
				area2.root.style.width = "-moz-calc( 100% - " + w + splitinfo + " )";
				area2.root.style.width = "-webkit-calc( 100% - " + w + splitinfo + " )";
				area2.root.style.width = "calc( 100% - " + w + splitinfo + " )";
				dynamic_section = area2;
			}
			else
			{
				var w1 = sizes[0];
				if(typeof(w1) == "number")
					w1 = sizes[0] + "px";
				var w2 = sizes[1];
				if(typeof(w2) == "number")
					w2 = sizes[1] + "px";

				area1.root.style.width = w1;
				area1.size = w1;
				area2.root.style.width = w2;
				area2.size = w2;
			}
		}

		area1.root.removeChild( area1.content );
		area1.root.appendChild( this.content );
		area1.content = this.content;

		this.root.appendChild( area1.root );
		if(splitbar)
			this.root.appendChild( splitbar );
		this.root.appendChild( area2.root );

		this.sections = [area1, area2];
		this.dynamic_section = dynamic_section;
		this.direction = direction;

		//SPLITTER DRAGGER INTERACTION
		var that = this;
		var last_pos = [0,0];
		function inner_mousedown(e)
		{
			var doc = that.root.ownerDocument;
			doc.addEventListener("mousemove",inner_mousemove);
			doc.addEventListener("mouseup",inner_mouseup);
			last_pos[0] = e.pageX;
			last_pos[1] = e.pageY;
			e.stopPropagation();
			e.preventDefault();
		}

		function inner_mousemove(e)
		{
			if(direction == "horizontal")
			{
				if (last_pos[0] != e.pageX)
					that.moveSplit(last_pos[0] - e.pageX);
			}
			else if(direction == "vertical")
			{
				if (last_pos[1] != e.pageY)
					that.moveSplit(e.pageY - last_pos[1]);
			}

			last_pos[0] = e.pageX;
			last_pos[1] = e.pageY;
			e.stopPropagation();
			e.preventDefault();
			if(that.options.immediateResize || that.options.inmediateResize) //inmediate is for legacy...
				that.onResize();
		}

		function inner_mouseup(e)
		{
			var doc = that.root.ownerDocument;
			doc.removeEventListener("mousemove",inner_mousemove);
			doc.removeEventListener("mouseup",inner_mouseup);
			that.onResize();
		}
	}

	Area.prototype.hide = function()
	{
		this.root.style.display = "none";
	}

	Area.prototype.show = function()
	{
		this.root.style.display = "block";
	}

	Area.prototype.showSection = function(num)
	{
		var section = this.sections[num];
		var size = 0;

		if( section && section.root.style.display != "none" )
			return; //already visible
		
		if(this.direction == "horizontal")
			size = section.root.style.width;
		else
			size = section.root.style.height;

		if(size.indexOf("calc") != -1)
			size = "50%";

		for(var i in this.sections)
		{
			var section = this.sections[i];

			if(i == num)
				section.root.style.display = "inline-block";
			else
			{
				if(this.direction == "horizontal")
					section.root.style.width = "calc( 100% - " + size + " - 5px)";
				else
					section.root.style.height = "calc( 100% - " + size + " - 5px)";
			}
		}

		if(this.splitbar)
			this.splitbar.style.display = "inline-block";

		this.sendResizeEvent();
	}

	Area.prototype.hideSection = function(num)
	{
		for(var i in this.sections)
		{
			var section = this.sections[i];

			if(i == num)
				section.root.style.display = "none";
			else
			{
				if(this.direction == "horizontal")
					section.root.style.width = "100%";
				else
					section.root.style.height = "100%";
			}
		}

		if(this.splitbar)
			this.splitbar.style.display = "none";

		this.sendResizeEvent();
	}

	Area.prototype.moveSplit = function(delta)
	{
		if(!this.sections) return;

		var area1 = this.sections[0];
		var area2 = this.sections[1];
		var splitinfo = " - "+ Area.splitbar_size +"px";

		var min_size = this.options.minSplitSize || 10;

		if(this.direction == "horizontal")
		{

			if (this.dynamic_section == area1)
			{
				var size = (area2.root.offsetWidth + delta);
				if(size < min_size)
					size = min_size;
				area1.root.style.width = "-moz-calc( 100% - " + size + "px " + splitinfo + " )";
				area1.root.style.width = "-webkit-calc( 100% - " + size + "px " + splitinfo + " )";
				area1.root.style.width = "calc( 100% - " + size + "px " + splitinfo + " )";
				area2.root.style.width = size + "px"; //other split
			}
			else
			{
				var size = (area1.root.offsetWidth - delta);
				if(size < min_size)
					size = min_size;
				area2.root.style.width = "-moz-calc( 100% - " + size + "px " + splitinfo + " )";
				area2.root.style.width = "-webkit-calc( 100% - " + size + "px " + splitinfo + " )";
				area2.root.style.width = "calc( 100% - " + size + "px " + splitinfo + " )";
				area1.root.style.width = size + "px"; //other split
			}
		}
		else if(this.direction == "vertical")
		{
			if (this.dynamic_section == area1)
			{
				var size = (area2.root.offsetHeight - delta);
				if(size < min_size)
					size = min_size;
				area1.root.style.height = "-moz-calc( 100% - " + size + "px " + splitinfo + " )";
				area1.root.style.height = "-webkit-calc( 100% - " + size + "px " + splitinfo + " )";
				area1.root.style.height = "calc( 100% - " + size + "px " + splitinfo + " )";
				area2.root.style.height = size + "px"; //other split
			}
			else
			{
				var size = (area1.root.offsetHeight + delta);
				if(size < min_size)
					size = min_size;
				area2.root.style.height = "-moz-calc( 100% - " + size + "px " + splitinfo + " )";
				area2.root.style.height = "-webkit-calc( 100% - " + size + "px " + splitinfo + " )";
				area2.root.style.height = "calc( 100% - " + size + "px " + splitinfo + " )";
				area1.root.style.height = size + "px"; //other split
			}
		}

		LiteGUI.trigger( this.root, "split_moved");
		//trigger split_moved event in all areas inside this area
		var areas = this.root.querySelectorAll(".litearea");
		for(var i = 0; i < areas.length; ++i)
			LiteGUI.trigger( areas[i], "split_moved" );
	}

	Area.prototype.addEventListener = function(a,b,c,d)
	{
		return this.root.addEventListener(a,b,c,d);
	}

	Area.prototype.setAreaSize = function(area,size)
	{
		var element = this.sections[1];

		var splitinfo = " - "+Area.splitbar_size+"px";
		element.root.style.width = "-moz-calc( 100% - " + size + splitinfo + " )";
		element.root.style.width = "-webkit-calc( 100% - " + size + splitinfo + " )";
		element.root.style.width = "calc( 100% - " + size + splitinfo + " )";
	}

	Area.prototype.merge = function(main_section)
	{
		if(this.sections.length == 0) throw "not splitted";

		var main = this.sections[main_section || 0];

		this.root.appendChild( main.content );
		this.content = main.content;

		this.root.removeChild( this.sections[0].root );
		this.root.removeChild( this.sections[1].root );

		/*
		while(main.childNodes.length > 0)
		{
			var e = main.childNodes[0];
			this.root.appendChild(e);
		}

		this.root.removeChild( this.sections[0].root );
		this.root.removeChild( this.sections[1].root );
		*/

		this.sections = [];
		this._computed_size = null;
		this.onResize();
	}

	Area.prototype.add = function(v)
	{
		if(typeof(v) == "string")
		{
			var element = document.createElement("div");
			element.innerHTML = v;
			v = element;
		}

		this.content.appendChild( v.root || v );
	}

	Area.prototype.query = function(v)
	{
		return this.root.querySelector(v);
	}

	LiteGUI.Area = Area;

	/***************** SPLIT ******************/

	/**
	* Split 
	*
	* @class Split
	* @constructor
	*/
	function Split( sections, options, legacy )
	{
		options = options || {};

		if(sections && sections.constructor === String)
		{
			var id = sections;
			sections = options;
			options = legacy || {};
			options.id = id;
			console.warn("LiteGUI.Split legacy parameter, use sections as first parameter instead of id.");
		}

		var root = document.createElement("div");
		this.root = root;
		if(options.id)
			root.id = id;
		root.className = "litesplit " + (options.vertical ? "vsplit" : "hsplit");
		this.sections = [];

		for(var i in sections)
		{
			var section = document.createElement("div");

			section.className = "split-section split" + i;
			if(typeof(sections[i]) == "number")
			{
				if(options.vertical)
					section.style.height = sections[i].toFixed(1) + "%";
				else
					section.style.width = sections[i].toFixed(1) + "%";
			}
			else if(typeof(sections[i]) == "string")
			{
				if(options.vertical)
					section.style.height = sections[i];
				else
					section.style.width = sections[i];
			}
			else
			{
				if(sections[i].id) section.id = sections[i].id;
				if(options.vertical)
					section.style.height = (typeof(sections[i].height) == "Number" ? sections[i].height.toFixed(1) + "%" : sections[i].height);
				else
					section.style.width = (typeof(sections[i].width) == "Number" ? sections[i].width.toFixed(1) + "%" : sections[i].width);
			}

			section.add = function(element) {
				this.appendChild( element.root || element );
			}

			this.sections.push(section);
			root.appendChild(section);
		}

		if(options.parent)
		{
			if(options.parent.root)
				options.parent.root.appendChild(root);
			else
				options.parent.appendChild(root);
		}

		this.getSection = function(n)
		{
			return this.sections[n];
		}
	}

	LiteGUI.Split = Split;

})();
(function(){

	/************** MENUBAR ************************/
	function Menubar(id, options)
	{
		options = options || {};

		this.menu = [];
		this.panels = [];

		this.root = document.createElement("div");
		this.root.id = id;
		this.root.className = "litemenubar";

		this.content = document.createElement("ul");
		this.root.appendChild( this.content );

		this.is_open = false;
		this.auto_open = options.auto_open || false;
		this.sort_entries = options.sort_entries || false;
	}

	Menubar.closing_time = 500;

	Menubar.prototype.clear = function()
	{
		this.content.innerHTML = "";
		this.menu = [];
		this.panels = [];
	}

	Menubar.prototype.attachToPanel = function(panel)
	{
		panel.content.insertBefore( this.root, panel.content.firstChild );
	}

	Menubar.prototype.add = function( path, data )
	{
		data = data || {};

		if( typeof(data) == "function" )
			data = { callback: data };

		var prev_length = this.menu.length;

		var tokens = path.split("/");
		var current_token = 0;
		var current_pos = 0;
		var menu = this.menu;
		var last_item = null;

		while( menu )
		{
			if(current_token > 5)
				throw("Error: Menubar too deep");
			//token not found in this menu, create it
			if( menu.length == current_pos )
			{
				var v = { parent: last_item, children: [] };
				last_item = v;
				if(current_token == tokens.length - 1)
					v.data = data;

				v.disable = function() { if( this.data ) this.data.disabled = true; }
				v.enable = function() { if( this.data ) delete this.data.disabled; }

				v.name = tokens[ current_token ];
				menu.push( v );
				current_token++;
				if( current_token == tokens.length )
					break;
				v.children = [];
				menu = v.children;
				current_pos = 0;
				continue;
			}

			//token found in this menu, get inside for next token
			if( menu[ current_pos ] && tokens[ current_token ] == menu[ current_pos ].name )
			{
				if(current_token < tokens.length - 1)
				{
					last_item = menu[ current_pos ];
					menu = menu[ current_pos ].children;
					current_pos = 0;
					current_token++;
					continue;
				}
				else //last token
				{
					console.warn("Warning: Adding menu that already exists: " + path );
					break;
				}
			}
			current_pos++;
		}

		if(prev_length != this.menu.length)
			this.updateMenu();
	};

	Menubar.prototype.remove = function( path )
	{
		var menu = this.findMenu( path );
		if(!menu)
			return;
		if(!menu.parent || !menu.parent.children)
			return console.warn("menu without parent?");
		
		var index = menu.parent.children.indexOf( menu );
		if(index != -1)
			menu.parent.children.splice( index, 1 );
	},

	Menubar.prototype.separator = function( path, order )
	{
		var menu = this.findMenu( path );
		if(!menu)
			return;
		menu.children.push( {separator: true, order: order || 10 } );
	}

	//returns the menu entry that matches this path
	Menubar.prototype.findMenu = function( path )
	{
		var tokens = path.split("/");
		var current_token = 0;
		var current_pos = 0;
		var menu = this.menu;

		while( menu )
		{
			//no more tokens, return last found menu
			if(current_token == tokens.length)
				return menu;

			//this menu doesnt have more entries
			if(menu.length <= current_pos)
				return null;

			if(tokens[ current_token ] == "*")
				return menu[ current_pos ].children;

			//token found in this menu, get inside for next token
			if( tokens[ current_token ] == menu[ current_pos ].name )
			{
				if(current_token == tokens.length - 1) //last token
				{
					return menu[ current_pos ];
				}
				else
				{
					menu = menu[ current_pos ].children;
					current_pos = 0;
					current_token++;
					continue;
				}
			}

			//check next entry in this menu
			current_pos++;
		}
		return null;
	}

	//update top main menu
	Menubar.prototype.updateMenu = function()
	{
		var that = this;

		this.content.innerHTML = "";
		for(var i in this.menu)
		{
			var element = document.createElement("li");
			element.innerHTML = "<span class='icon'></span><span class='name'>" + this.menu[i].name + "</span>";
			this.content.appendChild(element);
			element.data = this.menu[i];
			this.menu[i].element = element;

			/* ON CLICK TOP MAIN MENU ITEM */
			element.addEventListener("click", function(e) {
				var item = this.data;

				if(item.data && item.data.callback && typeof(item.data.callback) == "function")
					item.data.callback(item.data);

				if(!that.is_open)
				{
					that.is_open = true;
					that.showMenu( item, e, this );
				}
				else
				{
					that.is_open = false;
					that.hidePanels();
				}
			});

			element.addEventListener("mouseover", function(e) {
				that.hidePanels();
				if(that.is_open || that.auto_open)
					that.showMenu( this.data, e, this );
			});
		}
	}

	Menubar.prototype.hidePanels = function() {
		if(!this.panels.length)
			return;

		for(var i in this.panels)
			LiteGUI.remove(this.panels[i]);
		this.panels = [];
	}

	//Create the panel with the drop menu
	Menubar.prototype.showMenu = function(menu, e, root, is_submenu) {

		if(!is_submenu)
			this.hidePanels();

		if(!menu.children || !menu.children.length)
			return;

		var that = this;
		if(that.closing_by_leave)
			clearInterval(that.closing_by_leave);

		var element = document.createElement("div");
		element.className = "litemenubar-panel";

		var sorted_entries = [];
		for(var i in menu.children)
			sorted_entries.push(menu.children[i]);

		if(this.sort_entries)
			sorted_entries.sort(function(a,b) {
				var a_order = 10;
				var b_order = 10;
				if(a && a.data && a.data.order != null) a_order = a.data.order;
				if(a && a.separator && a.order != null) a_order = a.order;
				if(b && b.data && b.data.order != null) b_order = b.data.order;
				if(b && b.separator && b.order != null) b_order = b.order;
				return a_order - b_order;
			});

		for(var i in sorted_entries)
		{
			var item = document.createElement("p");
			var menu_item = sorted_entries[i];

			item.className = 'litemenu-entry ' + ( item.children ? " submenu" : "" );
			var has_submenu = menu_item.children && menu_item.children.length;

			if(has_submenu)
				item.classList.add("has_submenu");

			if(menu_item && menu_item.name)
				item.innerHTML = "<span class='icon'></span><span class='name'>" + menu_item.name + (has_submenu ? "<span class='more'>+</span>":"") + "</span>";
			else
			{
				item.classList.add("separator");
				//item.innerHTML = "<span class='separator'></span>";
			}

			item.data = menu_item;

			//check if it has to show the item being 'checked'
			if( item.data.data )
			{
				var data = item.data.data;

				var checked = (data.type == "checkbox" && data.instance && data.property && data.instance[ data.property ] == true) || 
					data.checkbox == true ||
					(data.instance && data.property && data.hasOwnProperty("value") && data.instance[data.property] == data.value) ||
					(typeof( data.isChecked ) == "function" && data.isChecked.call(data.instance, data) );

				if(checked)
					item.className += " checked";

				if(data.disabled)
					item.className += " disabled";
			}

			/* ON CLICK SUBMENU ITEM */
			item.addEventListener("click",function(){
				var item = this.data;
				if(item.data)
				{
					if(item.data.disabled)
						return;

					//to change variables directly
					if(item.data.instance && item.data.property)
					{
						if( item.data.type == "checkbox" )
						{
							item.data.instance[item.data.property] = !item.data.instance[item.data.property];
							if(	item.data.instance[item.data.property] )
								this.classList.add("checked");
							else
								this.classList.remove("checked");
						}
						else if( item.data.hasOwnProperty("value") )
						{
							item.data.instance[item.data.property] = item.data.value;
						}
					}

					//to have a checkbox behaviour
					if(item.data.checkbox != null)
					{
						item.data.checkbox = !item.data.checkbox;
						if(	item.data.checkbox )
							this.classList.add("checked");
						else
							this.classList.remove("checked");
					}

					//execute a function
					if(item.data.callback && typeof(item.data.callback) == "function")
						item.data.callback(item.data);
				}

				//more menus
				if(item.children && item.children.length)
				{
					that.showMenu( item, e, this, true );
				}
				else
				{
					that.is_open = false;
					that.hidePanels();
				}
			});

			item.addEventListener("mouseenter",function(e){
				/*
				if( that.auto_open && this.classList.contains("has_submenu") )
					LiteGUI.trigger( this, "click" );
				*/
			});

			element.appendChild( item );
		}

		element.addEventListener("mouseleave",function(e){
		
			if(that.closing_by_leave)
				clearInterval(that.closing_by_leave);

			that.closing_by_leave = setTimeout( function() { 
				that.is_open = false;
				that.hidePanels();
			},LiteGUI.Menubar.closing_time);
		});

		element.addEventListener("mouseenter",function(e){
			if(that.closing_by_leave)
				clearInterval(that.closing_by_leave);
			that.closing_by_leave = null;
		});

		//compute X and Y for menu
		var box = root.getBoundingClientRect();
		element.style.left = box.left + ( is_submenu ? 200 : 0 ) + "px";
		element.style.top = box.top + box.height + ( is_submenu ? -20 : 10 ) + "px";
		/* animation, not working well, flickers
		element.style.opacity = "0.1";
		element.style.transform = "translate(0,-10px)";
		element.style.transition = "all 0.2s";
		setTimeout( function(){ 
			element.style.opacity = "1"; 
			element.style.transform = "translate(0,0)";
		},1);
		*/

		this.panels.push(element);
		document.body.appendChild( element );
	}

	LiteGUI.Menubar = Menubar;
})();
/**************  ***************************/
(function(){
	

	/**
	* Widget that contains several tabs and their content
	* Options:
	* - mode: "vertical","horizontal"
	* - size
	* - width,height
	* - autoswitch: allow autoswitch (switch when mouse over)
	* @class Tabs
	* @constructor
	*/
	function Tabs( options, legacy )
	{
		if( legacy || (options && options.constructor === String) )
		{
			var id = options;
			options = legacy || {};
			options.id = id;
			console.warn("LiteGUI.Tabs legacy parameter, use options as first parameter instead of id.");
		}

		options = options || {};
		this.options = options;

		var mode = this.mode = options.mode || "horizontal";

		var root = document.createElement("DIV");
		if(options.id) 
			root.id = options.id;
		root.data = this;
		root.className = "litetabs " + mode;
		this.root = root;
		this.root.tabs = this;

		this.current_tab = null; //current tab array [id, tab, content]

		if(mode == "horizontal")
		{
			if(options.size)
			{
				if(options.size == "full")
					this.root.style.height = "100%";
				else
					this.root.style.height = options.size;
			}
		}
		else if(mode == "vertical")
		{
			if(options.size)
			{
				if(options.size == "full")
					this.root.style.width = "100%";
				else
					this.root.style.width = options.size;
			}
		}

		if(options.width)
			this.root.style.width = options.width.constructor === Number ? options.width.toFixed(0) + "px" : options.width;
		if(options.height)
			this.root.style.height = options.height.constructor === Number ? options.height.toFixed(0) + "px" : options.height;

		//container of tab elements
		var list = document.createElement("UL");
		list.className = "wtabcontainer";
		if(mode == "vertical")
			list.style.width = LiteGUI.Tabs.tabs_width + "px";
		else
			list.style.height = LiteGUI.Tabs.tabs_height + "px";

		//allows to use the wheel to see hidden tabs
		list.addEventListener("wheel", onMouseWheel);
		list.addEventListener("mousewheel", onMouseWheel);
		function onMouseWheel(e){
			if(e.deltaY)
				list.scrollLeft += e.deltaY;
		}

		this.list = list;
		this.root.appendChild(this.list);
		this.tabs_root = list;

		this.tabs = {};
		this.tabs_by_index = [];
		this.selected = null;

		this.onchange = options.callback;

		if(options.parent)
			this.appendTo(options.parent);
	}

	Tabs.tabs_width = 64;
	Tabs.tabs_height = 26;

	Tabs.prototype.show = function()
	{
		this.root.style.display = "block";
	}

	Tabs.prototype.hide = function()
	{
		this.root.style.display = "none";
	}


	/**
	* Returns the currently selected tab in the form of a tab object
	* @method getCurrentTab
	* @return {Object} the tab in the form of an object with {id,tab,content}
	*/
	Tabs.prototype.getCurrentTab = function()
	{
		if(!this.current_tab)
			return null;
		return this.tabs[ this.current_tab[0] ];
	}

	Tabs.prototype.getCurrentTabId = function()
	{
		return this.current_tab[0];
	}

	/**
	* Returns the last tab pressed before this one. used to know from which tab we come
	* @method getCurrentTab
	* @return {Object} the tab in the form of an object with {id,tab,content}
	*/
	Tabs.prototype.getPreviousTab = function()
	{
		if(!this.previous_tab)
			return null;
		return this.tabs[ this.previous_tab[0] ];
	}

	Tabs.prototype.appendTo = function(parent, at_front)
	{
		if(at_front)
			parent.prepend(this.root);
		else
			parent.appendChild(this.root);
	}

	/**
	* Returns a tab given its id
	* @method getTab
	* @param {String} id tab id
	* @return {Object} the tab in the form of an object with {id,tab,content}
	*/
	Tabs.prototype.getTab = function(id)
	{
		return this.tabs[id];
	}

	/**
	* Returns a tab given its index in the tabs list
	* @method getTabByIndex
	* @param {Number} index
	* @return {Object} the tab in the form of an object with {id,tab,content}
	*/
	Tabs.prototype.getTabByIndex = function(index)
	{
		return this.tabs_by_index[index];
	}

	/**
	* Returns how many tabs there is
	* @method getNumOfTabs
	* @return {number} number of tabs
	*/
	Tabs.prototype.getNumOfTabs = function()
	{
		var num = 0;
		for(var i in this.tabs)
			num++;
		return num;
	}

	/**
	* Returns the content HTML element of a tab
	* @method getTabContent
	* @param {String} id
	* @return {HTMLEntity} content
	*/
	Tabs.prototype.getTabContent = function(id)
	{
		var tab = this.tabs[id];
		if(tab)
			return tab.content;
	}

	/**
	* Returns the index of a tab (the position in the tabs list)
	* @method getTabIndex
	* @param {String} id
	* @return {number} index
	*/
	Tabs.prototype.getTabIndex = function(id)
	{
		var tab = this.tabs[id];
		if(!tab)
			return -1;
		for(var i = 0; i < this.list.childNodes.length; i++)
			if( this.list.childNodes[i] == tab.tab )
				return i;
		return -1;
	}


	/**
	* Create a new tab, where id is a unique identifier
	* @method addTab
	* @param {String} id could be null then a random id is generated
	* @param {Object} options { 
	*	title: tab text, 
	*	callback: called when selected, 
	*	callback_leave: callback when leaving, 
	*   callback_context: on right click on tab
	*   callback_canopen: used to block if this tab can be opened or not (if it returns true then yes)
	*	content: HTML content, 
	*   closable: if it can be closed (callback is onclose), 
	*	tab_width: size of the tab,
	*	tab_className: classes for the tab element,
	*	id: content id,
	*	size: full means all,
	*	mode: "vertical" or "horizontal",
	*	button: if it is a button tab, not a selectable tab
	*	}
	* @param {bool} skip_event prevent dispatching events
	* @return {Object} an object containing { id, tab, content }
	*/
	Tabs.prototype.addTab = function( id, options, skip_event )
	{
		options = options || {};
		if(typeof(options) == "function")
			options = { callback: options };

		var that = this;
		if(id === undefined || id === null)
			id = "rand_" + ((Math.random() * 1000000)|0);

		//the tab element
		var element = document.createElement("LI");
		var safe_id = id.replace(/ /gi,"_");
		element.className = "wtab wtab-" + safe_id + " ";
		//if(options.selected) element.className += " selected";
		element.dataset["id"] = id;
		element.innerHTML = "<span class='tabtitle'>" + (options.title || id) + "</span>";

		if(options.button)
			element.className += "button ";
		if(options.tab_className)
			element.className += options.tab_className;
		if(options.bigicon)
			element.innerHTML = "<img class='tabbigicon' src='" + options.bigicon+"'/>" + element.innerHTML;
		if(options.closable)
		{
			element.innerHTML += "<span class='tabclose'>" + LiteGUI.special_codes.close + "</span>";
			element.querySelector("span.tabclose").addEventListener("click", function(e) { 
				that.removeTab(id);
				e.preventDefault();
				e.stopPropagation();
			},true);
		}
		//WARNING: do not modify element.innerHTML or events will be lost

		if( options.index !== undefined )
		{
			var after = this.list.childNodes[options.index];
			if(after)
				this.list.insertBefore(element,after);
			else
				this.list.appendChild(element);
		}
		else if( this.plus_tab )
			this.list.insertBefore( element, this.plus_tab );
		else
			this.list.appendChild(element);

		if(options.tab_width)
		{
			element.style.width = options.tab_width.constructor === Number ? ( options.tab_width.toFixed(0) + "px" ) : options.tab_width;
			element.style.minWidth = "0";
		}

		if(this.options.autoswitch)
		{
			element.classList.add("autoswitch");
			element.addEventListener("dragenter",function(e){
				//console.log("Enter",this.dataset["id"]);
				if(that._timeout_mouseover)
					clearTimeout(that._timeout_mouseover);
				that._timeout_mouseover = setTimeout((function(){
					LiteGUI.trigger(this,"click");
					that._timeout_mouseover = null;
				}).bind(this),500);
			});
			
			element.addEventListener("dragleave",function(e){
				//console.log("Leave",this.dataset["id"]);
				if(that._timeout_mouseover)
				{
					clearTimeout(that._timeout_mouseover);
					that._timeout_mouseover = null;
				}
			});
		}


		//the content of the tab
		var content = document.createElement("div");
		if(options.id)
			content.id = options.id;

		content.className = "wtabcontent " + "wtabcontent-" + safe_id + " " + (options.className || "");
		content.dataset["id"] = id;
		content.style.display = "none";

		//adapt height
		if(this.mode == "horizontal")
		{
			if(options.size)
			{
				content.style.overflow = "auto";
				if(options.size == "full")
				{
					content.style.width = "100%";
					content.style.height = "calc( 100% - "+LiteGUI.Tabs.tabs_height+"px )"; //minus title
					content.style.height = "-moz-calc( 100% - "+LiteGUI.Tabs.tabs_height+"px )"; //minus title
					content.style.height = "-webkit-calc( 100% - "+LiteGUI.Tabs.tabs_height+"px )"; //minus title
					//content.style.height = "-webkit-calc( 90% )"; //minus title
				}
				else
					content.style.height = options.size;
			}
		}
		else if(this.mode == "vertical")
		{
			if(options.size)
			{
				content.style.overflow = "auto";
				if(options.size == "full")
				{
					content.style.height = "100%";
					content.style.width = "calc( 100% - "+LiteGUI.Tabs.tabs_width+"px )"; //minus title
					content.style.width = "-moz-calc( 100% - "+LiteGUI.Tabs.tabs_width+"px )"; //minus title
					content.style.width = "-webkit-calc( 100% - "+LiteGUI.Tabs.tabs_width+"px )"; //minus title
					//content.style.height = "-webkit-calc( 90% )"; //minus title
				}
				else
					content.style.width = options.size;
			}
		}

		//overwrite
		if(options.width !== undefined )
			content.style.width = typeof(options.width) === "string" ? options.width : options.width + "px";
		if(options.height !== undefined )
			content.style.height = typeof(options.height) === "string" ? options.height : options.height + "px";

		//add content
		if(options.content)
		{
			if (typeof(options.content) == "string")
				content.innerHTML = options.content;
			else
				content.appendChild(options.content);
		}

		this.root.appendChild(content);

		//when clicked
		if(!options.button)
			element.addEventListener("click", Tabs.prototype.onTabClicked );
		else
			element.addEventListener("click", function(e){ 
				var tab_id = this.dataset["id"];
				if(options.callback)
					options.callback( tab_id, e );
			});

		element.options = options;
		element.tabs = this;

		var title = element.querySelector("span.tabtitle");

		//tab object
		var tab_info = {
			id: id,
			tab: element,
			content: content,
			title: title,
			add: function(v) { this.content.appendChild(v.root || v); },
			setTitle: function( title )	{ this.title.innerHTML = title; },
			click: function(){ LiteGUI.trigger( this.tab, "click" ); },
			destroy: function(){ that.removeTab(this.id) }
		};

		if(options.onclose)
			tab_info.onclose = options.onclose;
		this.tabs[ id ] = tab_info;

		this.recomputeTabsByIndex();

		//context menu
		element.addEventListener("contextmenu", (function(e) { 
			if(e.button != 2) //right button
				return false;
			e.preventDefault(); 
			if(options.callback_context)
				options.callback_context.call(tab_info);
			return false;
		}).bind(this));

		if ( options.selected == true || this.selected == null )
			this.selectTab( id, options.skip_callbacks );

		return tab_info;
	}

	Tabs.prototype.addPlusTab = function( callback )
	{
		if(this.plus_tab)
			console.warn("There is already a plus tab created in this tab widget");
		this.plus_tab = this.addTab( "plus_tab", { title: "+", tab_width: 20, button: true, callback: callback, skip_callbacks: true });
	}

	Tabs.prototype.addButtonTab = function( id, title, callback )
	{
		return this.addTab( id, { title: title, tab_width: 20, button: true, callback: callback, skip_callbacks: true });
	}

	//this is tab
	Tabs.prototype.onTabClicked = function(e)
	{
		//skip if already selected
		if( this.classList.contains("selected") ) 
			return;

		if(!this.parentNode)
			return; //this could happend if it gets removed while being clicked (not common)

		var options = this.options;
		var tabs = this.parentNode.parentNode.tabs;
		if(!tabs)
			throw("tabs not found");
		var that = tabs;

		//check if this tab is available
		if(options.callback_canopen && options.callback_canopen() == false)
			return;

		//launch leaving current tab event
		if( that.current_tab && 
			that.current_tab[0] != tab_id && 
			that.current_tab[2] && 
			that.current_tab[2].callback_leave)
				that.current_tab[2].callback_leave( that.current_tab[0], that.current_tab[1], that.current_tab[2] );

		var tab_id = this.dataset["id"];
		var tab_content = null;

		//iterate tab labels
		for(var i in that.tabs)
		{
			var tab_info = that.tabs[i];
			if( i == tab_id )
			{
				tab_info.selected = true;
				tab_info.content.style.display = "";
				tab_content = tab_info.content;
			}
			else
			{
				delete tab_info.selected;
				tab_info.content.style.display = "none";
			}
		}

		var list = that.list.querySelectorAll("li.wtab");
		for(var i = 0; i < list.length; ++i)
			list[i].classList.remove("selected");
		this.classList.add("selected");

		//change tab
		that.previous_tab = that.current_tab;
		that.current_tab = [tab_id, tab_content, options];

		if(e) //user clicked
		{
			//launch callback
			if(options.callback) 
				options.callback(tab_id, tab_content,e);

			LiteGUI.trigger(that,"wchange",[tab_id, tab_content]);
			if(that.onchange)
				that.onchange( tab_id, tab_content );
		}

		//change afterwards in case the user wants to know the previous one
		that.selected = tab_id;
	}

	Tabs.prototype.selectTab = function( id, skip_events )
	{
		if(!id)
			return;

		if( id.constructor != String )
			id = id.id; //in case id is the object referencing the tab

		var tabs = this.list.querySelectorAll("li.wtab");
		for(var i = 0; i < tabs.length; i++)
			if( id == tabs[i].dataset["id"] )
			{
				this.onTabClicked.call( tabs[i], !skip_events );
				break;
			}
	}

	Tabs.prototype.setTabVisibility = function(id, v)
	{
		var tab = this.tabs[id];
		if(!tab)
			return;

		tab.tab.style.display = v ? "none" : null;
		tab.content.style.display = v ? "none" : null;
	}

	Tabs.prototype.recomputeTabsByIndex = function()
	{
		this.tabs_by_index = [];

		for(var i in this.tabs)
		{
			var tab = this.tabs[i];

			//compute index
			var index = 0;
			var child = tab.tab;
			while( (child = child.previousSibling) != null ) 
				index++;

			this.tabs_by_index[index] = tab;
		}
	}

	Tabs.prototype.removeTab = function(id)
	{
		var tab = this.tabs[id];
		if(!tab)
		{
			console.warn( "tab not found: " + id );
			return;
		}

		if(tab.onclose)
			tab.onclose(tab);

		if(tab.tab.parentNode)
			tab.tab.parentNode.removeChild( tab.tab );
		if(tab.content.parentNode)
			tab.content.parentNode.removeChild( tab.content );
		delete this.tabs[id];

		this.recomputeTabsByIndex();
	}

	Tabs.prototype.removeAllTabs = function( keep_plus )
	{
		var tabs = [];
		for(var i in this.tabs)
			tabs.push( this.tabs[i] );

		for(var i in tabs)
		{
			var tab = tabs[i];
			if(tab == this.plus_tab && keep_plus)
				continue;
			if(tab.tab.parentNode)
				tab.tab.parentNode.removeChild( tab.tab );
			if(tab.content.parentNode)
				tab.content.parentNode.removeChild( tab.content );
			delete this.tabs[ tab.id ];
		}

		this.recomputeTabsByIndex();
	}

	Tabs.prototype.clear = function()
	{
		this.removeAllTabs();
	}

	Tabs.prototype.hideTab = function(id)
	{
		this.setTabVisibility(id, false);
	}

	Tabs.prototype.showTab = function(id)
	{
		this.setTabVisibility(id, true);
	}

	Tabs.prototype.transferTab = function(id, target_tabs, index)
	{
		var tab = this.tabs[id];
		if(!tab)
			return;

		target_tabs.tabs[id] = tab;

		if(index !== undefined)
			target_tabs.list.insertBefore(tab.tab, target_tabs.list.childNodes[index]);
		else
			target_tabs.list.appendChild(tab.tab);
		target_tabs.root.appendChild(tab.content);
		delete this.tabs[id];

		var newtab = null;
		for(var i in this.tabs)
		{
			newtab = i;
			break;
		}

		if(newtab)
			this.selectTab(newtab);

		tab.tab.classList.remove("selected");
		target_tabs.selectTab(id);
	}

	Tabs.prototype.detachTab = function(id, on_complete, on_close )
	{
		var tab = this.tabs[id];
		if(!tab)
			return;

		var index = this.getTabIndex( id );

		//create window
		var w = 800;
		var h = 600;
		var tab_window = window.open("","","width="+w+", height="+h+", location=no, status=no, menubar=no, titlebar=no, fullscreen=yes");
		tab_window.document.write( "<head><title>"+id+"</title>" );

		//transfer style
		var styles = document.querySelectorAll("link[rel='stylesheet'],style");
		for(var i = 0; i < styles.length; i++)
			tab_window.document.write( styles[i].outerHTML );
		tab_window.document.write( "</head><body></body>" );
		tab_window.document.close();

		var that = this;

		//transfer content after a while so the window is propertly created
		var newtabs = new LiteGUI.Tabs(null, this.options );
		tab_window.tabs = newtabs;

		//closing event
		tab_window.onbeforeunload = function(){
			newtabs.transferTab( id, that, index);
			if(on_close)
				on_close();
		}

		//move the content there
		newtabs.list.style.height = "20px";
		tab_window.document.body.appendChild(newtabs.root);
		that.transferTab(id, newtabs);
		newtabs.tabs[id].tab.classList.add("selected");
		this.recomputeTabsByIndex();

		if(on_complete)
			on_complete();

		return tab_window;
	}


	LiteGUI.Tabs = Tabs;
})();
(function(){

	/***** DRAGGER **********/
	function Dragger(value, options)
	{
		if(value === null || value === undefined)
			value = 0;
		else if(value.constructor === String)
			value = parseFloat(value);
		else if(value.constructor !== Number)
			value = 0;

		this.value = value;
		var that = this;
		var precision = options.precision != undefined ? options.precision : 3; //num decimals

		this.options = options || {};
		var element = document.createElement("div");
		element.className = "dragger " + (options.extraclass ? options.extraclass : "");
		this.root = element;

		var wrap = document.createElement("span");
		wrap.className = "inputfield " + (options.extraclass ? options.extraclass : "") + (options.full ? " full" : "");
		if(options.disabled)
		wrap.className += " disabled";
		element.appendChild(wrap);

		var dragger_class = options.dragger_class || "full";

		var input = document.createElement("input");
		input.className = "text number " + (dragger_class ? dragger_class : "");
		input.value = value.toFixed( precision ) + (options.units ? options.units : "");
		input.tabIndex = options.tab_index;
		this.input = input;
		element.input = input;

		if(options.disabled)
			input.disabled = true;
		if(options.tab_index)
			input.tabIndex = options.tab_index;
		wrap.appendChild(input);

		input.addEventListener("keydown",function(e) {
			if(e.keyCode == 38)
				inner_inc(1,e);
			else if(e.keyCode == 40)
				inner_inc(-1,e);
			else
				return;
			e.stopPropagation();
			e.preventDefault();
			return true;
		});

		var dragger = document.createElement("div");
		dragger.className = "drag_widget";
		if(options.disabled)
			dragger.className += " disabled";

		wrap.appendChild(dragger);
		element.dragger = dragger;

		dragger.addEventListener("mousedown",inner_down);
		input.addEventListener("wheel",inner_wheel,false);
		input.addEventListener("mousewheel",inner_wheel,false);

		var doc_binded = null;

		function inner_down(e)
		{
			doc_binded = input.ownerDocument;

			doc_binded.removeEventListener("mousemove", inner_move);
			doc_binded.removeEventListener("mouseup", inner_up);

			if(!options.disabled)
			{
				if(element.requestPointerLock)
					element.requestPointerLock();
				doc_binded.addEventListener("mousemove", inner_move);
				doc_binded.addEventListener("mouseup", inner_up);

				dragger.data = [e.screenX, e.screenY];

				LiteGUI.trigger( element,"start_dragging");
			}

			e.stopPropagation();
			e.preventDefault();
		}

		function inner_move(e)
		{
			var deltax = e.screenX - dragger.data[0];
			var deltay = dragger.data[1] - e.screenY;
			var diff = [ deltax, deltay ];
			if(e.movementX !== undefined)
				diff = [e.movementX, -e.movementY]
			//console.log(e);
			dragger.data = [e.screenX, e.screenY];
			var axis = options.horizontal ? 0 : 1;
			inner_inc( diff[axis], e );

			e.stopPropagation();
			e.preventDefault();
			return false;
		};

		function inner_wheel(e)
		{
			//console.log("wheel!");
			if(document.activeElement !== this)
				return;
			var delta = e.wheelDelta !== undefined ? e.wheelDelta : (e.deltaY ? -e.deltaY/3 : 0);
			inner_inc( delta > 0 ? 1 : -1, e );
			e.stopPropagation();
			e.preventDefault();
		}

		function inner_up(e)
		{
			LiteGUI.trigger(element, "stop_dragging");
			var doc = doc_binded || document;
			doc_binded = null;
			doc.removeEventListener("mousemove", inner_move);
			doc.removeEventListener("mouseup", inner_up);
			if(doc.exitPointerLock)
				doc.exitPointerLock();
			LiteGUI.trigger(dragger,"blur");
			e.stopPropagation();
			e.preventDefault();
			return false;
		};

		function inner_inc(v,e)
		{
			if(!options.linear)
				v = v > 0 ? Math.pow(v,1.2) : Math.pow( Math.abs(v), 1.2) * -1;
			var scale = (options.step ? options.step : 1.0);
			if(e && e.shiftKey)
				scale *= 10;
			else if(e && e.ctrlKey)
				scale *= 0.1;
			var value = parseFloat( input.value ) + v * scale;
			if(options.max != null && value > options.max)
				value = options.max;
			if(options.min != null && value < options.min)
				value = options.min;

			input.value = value.toFixed( precision );
			//input.value = ((value * 1000)<<0) / 1000; //remove ugly decimals
			if(options.units)
				input.value += options.units;
			LiteGUI.trigger(input,"change");
		}
	}

	Dragger.prototype.setRange = function(min,max)
	{
		this.options.min = min;
		this.options.max = max;
	}

	Dragger.prototype.setValue = function(v, skip_event) { 
		v = parseFloat(v);
		this.value = v;
		if(this.options.precision)
			v = v.toFixed(this.options.precision);
		if(this.options.units)
			v += this.options.units;
		this.input.value = v;
		if(!skip_event)
			LiteGUI.trigger( this.input, "change" );
	}

	Dragger.prototype.getValue = function()
	{
		return this.value;
	}

	LiteGUI.Dragger = Dragger;

})();
//enclose in a scope
(function(){


/**
* To create interactive trees (useful for folders or hierarchies).<br>
* Options are:<br>
*	+ allow_multiselection: allow to select multiple elements using the shift key<br>
*	+ allow_rename: double click to rename items in the tree<br>
*	+ allow_drag: drag elements around<br>
*	+ height<br>
* Item data should be in the next format:<br>
* {<br>
*    id: unique_identifier,<br>
*    content: what to show in the HTML (if omited id will be shown)<br>
*	 children: []  array with another object with the same structure<br>
*	 className: class<br>
*    precontent: HTML inserted before the content<br>
*	 visible: boolean, to hide it<br>
*	 dataset: dataset for the element<br>
*	 onDragData: callback in case the user drags this item somewhere else<br>
* }<br>
* To catch events use tree.root.addEventListener(...)<br>
* item_selected : receive { item: node, data: node.data }<br>
* item_dblclicked<br>
* item_renamed<br>
* item_moved<br>
*
* @class Tree
* @constructor
*/

	/*********** LiteTree *****************************/
	function Tree( data, options, legacy )
	{
		if(legacy || (data && data.constructor === String) )
		{
			var id = data;
			data = options;
			options = legacy || {};
			options.id = id;
			console.warn("LiteGUI.Tree legacy parameter, use data as first parameter instead of id.");
		}

		options = options || {};

		var root = document.createElement("div");
		this.root = root;
		if(options.id)
			root.id = options.id;

		root.className = "litetree";
		this.tree = data;
		var that = this;
		options = options || {allow_rename: false, allow_drag: true, allow_multiselection: false};
		this.options = options;
		this.indent_offset = options.indent_offset || 0;

		if(options.height)
			this.root.style.height = typeof(options.height) == "string" ? options.height : Math.round(options.height) + "px";

        this.collapsed_depth = 3;
        if(options.collapsed_depth != null)
            this.collapsed_depth = options.collapsed_depth;

		//bg click
		root.addEventListener("click", function(e){
			if(e.srcElement != that.root)
				return;

			if(that.onBackgroundClicked)
				that.onBackgroundClicked(e,that);
		});

		//bg click right mouse
		root.addEventListener("contextmenu", function(e) { 
			if(e.button != 2) //right button
				return false;

			if(that.onContextMenu) 
				that.onContextMenu(e);
			e.preventDefault(); 
			return false;
		});


		var root_item = this.createAndInsert(data, options, null);
		if(!root_item)
			throw("Error in LiteGUI.Tree, createAndInsert returned null");
		root_item.className += " root_item";
		//this.root.appendChild(root_item);
		this.root_item = root_item;
	}

	Tree.INDENT = 20;


	/**
	* update tree with new data (old data will be thrown away)
	* @method updateTree
	* @param {object} data
	*/
	Tree.prototype.updateTree = function( data )
	{
		this.root.innerHTML = "";
		var root_item = this.createAndInsert( data, this.options, null );
		if(root_item)
		{
			root_item.className += " root_item";
			this.root_item = root_item;
		}
		else
			this.root_item = null;
	}

	/**
	* update tree with new data (old data will be thrown away)
	* @method insertItem
	* @param {object} data
	* @param {string} parent_id
	* @param {number} position index in case you want to add it before the last position
	* @param {object} options
	* @return {DIVElement}
	*/
	Tree.prototype.insertItem = function( data, parent_id, position, options)
	{
		if(!parent_id)
		{
			var root = this.root.childNodes[0];
			if(root)
				parent_id = root.dataset["item_id"];
		}

		var element = this.createAndInsert( data, options, parent_id, position );

		//update parent collapse button
		if(parent_id)
			this._updateListBox( this._findElement(parent_id) ); //no options here, this is the parent


		return element;
	}

	Tree.prototype.createAndInsert = function( data, options, parent_id, element_index )
	{
		//find parent
		var parent_element_index = -1;
		if(parent_id)
			parent_element_index = this._findElementIndex( parent_id );
		else if(parent_id === undefined)
			parent_element_index = 0; //root

		var parent = null;
		var child_level = 0;

		//find level
		if(parent_element_index != -1)
		{
			parent = this.root.childNodes[ parent_element_index ];
			child_level = parseInt( parent.dataset["level"] ) + 1;
		}

		//create
		var element = this.createTreeItem( data, options, child_level );
		if(!element) //error creating element
			return;

		element.parent_id = parent_id;

		//check
		var existing_item = this.getItem( element.dataset["item_id"] );
		if( existing_item )
			console.warn("There another item with the same ID in this tree");

		//insert
		if(parent_element_index == -1)
			this.root.appendChild( element );
		else
			this._insertInside( element, parent_element_index, element_index );

		//compute visibility according to parents
		if( parent && !this._isNodeChildrenVisible( parent_id ) )
			element.classList.add("hidden");

		//children
		if(data.children)
		{
			for(var i = 0; i < data.children.length; ++i)
			{
				this.createAndInsert( data.children[i], options, data.id );
			}
		}

		//update collapse button
		this._updateListBox( element, options, child_level );

		if(options && options.selected)
			this.markAsSelected( element, true );

		return element;
	}

	//element to add, position of the parent node, position inside children, the depth level
	Tree.prototype._insertInside = function( element, parent_index, offset_index, level )
	{
		var parent = this.root.childNodes[ parent_index ];
		if(!parent)
			throw("No parent node found, index: " + parent_index +", nodes: " + this.root.childNodes.length );

		var parent_level = parseInt( parent.dataset["level"] );
		var child_level = level !== undefined ? level : parent_level + 1;

		var indent = element.querySelector(".indentblock");
		if(indent)
			indent.style.paddingLeft = ((child_level + this.indent_offset) * Tree.INDENT ) + "px"; //inner padding
		
		element.dataset["level"] = child_level;

		//under level nodes
		for( var j = parent_index+1; j < this.root.childNodes.length; ++j )
		{
			var new_childNode = this.root.childNodes[j];
			if( !new_childNode.classList || !new_childNode.classList.contains("ltreeitem") )
				continue;
			var current_level = parseInt( new_childNode.dataset["level"] );

			if( current_level == child_level && offset_index)
			{
				offset_index--;
				continue;
			}

			//last position
			if( current_level < child_level || (offset_index === 0 && current_level === child_level) )
			{
				this.root.insertBefore( element, new_childNode );
				return;
			}
		}

		//ended
		this.root.appendChild( element );
	}


	Tree.prototype._isNodeChildrenVisible = function( id )
	{
		var node = this.getItem( id );
		if(!node)
			return false;
		if( node.classList.contains("hidden") )
			return false;

		//check listbox
		var listbox = node.querySelector(".listbox");
		if(!listbox)
			return true;
		if(listbox.getValue() == "closed")
			return false;
		return true;
	}

	Tree.prototype._findElement = function( id )
	{
		if( !id || id.constructor !== String)
			throw("findElement param must be string with item id");
		for(var i = 0; i < this.root.childNodes.length; ++i)
		{
			var childNode = this.root.childNodes[i];
			if( !childNode.classList || !childNode.classList.contains("ltreeitem") )
				continue;
			if( childNode.classList.contains("ltreeitem-" + id) )
				return childNode;
		}

		return null;
	}

	Tree.prototype._findElementIndex = function( id )
	{
		for(var i = 0; i < this.root.childNodes.length; ++i)
		{
			var childNode = this.root.childNodes[i];
			if( !childNode.classList || !childNode.classList.contains("ltreeitem") )
				continue;

			if(typeof(id) === "string")
			{
				if(childNode.dataset["item_id"] === id)
					return i;
			}
			else if( childNode === id )
				return i;
		}

		return -1;
	}

	Tree.prototype._findElementLastChildIndex = function( start_index )
	{
		if(start_index == -1)
			return -1;

		var level = parseInt( this.root.childNodes[ start_index ].dataset["level"] );

		for(var i = start_index+1; i < this.root.childNodes.length; ++i)
		{
			var childNode = this.root.childNodes[i];
			if( !childNode.classList || !childNode.classList.contains("ltreeitem") )
				continue;

			var current_level = parseInt( childNode.dataset["level"] );
			if( current_level == level )
				return i;
		}

		return -1;
	}

	//returns child elements (you can control levels)
	Tree.prototype._findChildElements = function( id, only_direct )
	{
		var parent_index = this._findElementIndex( id );
		if(parent_index == -1)
			return;

		var parent = this.root.childNodes[ parent_index ];
		var parent_level = parseInt( parent.dataset["level"] );

		var result = [];

		for(var i = parent_index + 1; i < this.root.childNodes.length; ++i)
		{
			var childNode = this.root.childNodes[i];
			if( !childNode.classList || !childNode.classList.contains("ltreeitem") )
				continue;

			var current_level = parseInt( childNode.dataset["level"] );
			if(only_direct && current_level > (parent_level + 1) )
				continue;
			if(current_level <= parent_level)
				return result;

			result.push( childNode );
		}

		return result;
	}
	
	Tree.prototype.createTreeItem = function( data, options, level )
	{
		if(data === null || data === undefined)
		{
			console.error("Tree item cannot be null");
			return;
		}

		options = options || this.options;

		var root = document.createElement("li");
		root.className = "ltreeitem";
		var that = this;

		//ids are not used because they could collide, classes instead
		if(data.id)
		{
			var safe_id = data.id.replace(/\s/g,"_");
			root.className += " ltreeitem-" + safe_id;
			root.dataset["item_id"] = data.id;
		}

		if(data.dataset)
			for(var i in data.dataset)
				root.dataset[i] = data.dataset[i];

		data.DOM = root; //double link
		root.data = data;

		if(level !== undefined)
		{
			root.dataset["level"] = level;
			root.classList.add("ltree-level-" + level);
		}

		var title_element = document.createElement("div");
		title_element.className = "ltreeitemtitle";
		if(data.className)
			title_element.className += " " + data.className;

		title_element.innerHTML = "<span class='precontent'></span><span class='indentblock'></span><span class='collapsebox'></span><span class='incontent'></span><span class='postcontent'></span>";

		var content = data.content || data.id || "";
		title_element.querySelector(".incontent").innerHTML = content;

		if(data.precontent)
			title_element.querySelector(".precontent").innerHTML = data.precontent;

		if(data.dataset)
			for(var i in data.dataset)
				root.dataset[i] = data.dataset[i];

		root.appendChild( title_element );
		root.title_element = title_element;

		if(data.visible === false)
			root.style.display = "none";

		//var row = root.querySelector(".ltreeitemtitle .incontent");
		var row = root;
		row.addEventListener("click", onNodeSelected );
		row.addEventListener("dblclick",onNodeDblClicked );
		row.addEventListener("contextmenu", function(e) { 
			var item = this;
			e.preventDefault(); 
			e.stopPropagation();

			if(e.button != 2) //right button
				return;

			if(that.onItemContextMenu)
				return that.onItemContextMenu(e, { item: item, data: item.data} );

			return false;
		});

		function onNodeSelected(e)
		{
			e.preventDefault();
			e.stopPropagation();

			//var title = this.parentNode;
			//var item = title.parentNode;
			var node = this;
			var title = node.title_element;

			if(title._editing) 
				return;

			if(e.ctrlKey && that.options.allow_multiselection)
			{
				//check if selected
				if( that.isNodeSelected( node ) )
				{
					node.classList.remove("selected");
					LiteGUI.trigger(that, "item_remove_from_selection", { item: node, data: node.data} );
					LiteGUI.trigger(that.root, "item_remove_from_selection", { item: node, data: node.data} ); //LEGACY
					return;
				}

				//mark as selected
				that.markAsSelected( node, true );
				LiteGUI.trigger(that, "item_add_to_selection", { item: node, data: node.data} );
				LiteGUI.trigger(that.root, "item_add_to_selection", { item: node, data: node.data} ); //LEGACY
				var r = false;
				if(data.callback) 
					r = data.callback.call(that,node);

				if(!r && that.onItemAddToSelection)
					that.onItemAddToSelection(node.data, node);
			}
			if(e.shiftKey && that.options.allow_multiselection)
			{
				//select from current selection till here
				//current
				var last_item = that.getSelectedItem();
				if(!last_item)
					return;

				if(last_item === node)
					return;

				var nodeList = Array.prototype.slice.call( last_item.parentNode.children );
				var last_index = nodeList.indexOf( last_item );
				var current_index = nodeList.indexOf( node );

				var items = current_index > last_index ? nodeList.slice( last_index, current_index ) : nodeList.slice( current_index, last_index );
				for( var i = 0; i < items.length; ++i )
				{
					var item = items[i];
					//console.log(item);
					//mark as selected
					that.markAsSelected( item, true );
					LiteGUI.trigger( that, "item_add_to_selection", { item: item, data: item.data } );
					LiteGUI.trigger( that.root, "item_add_to_selection", { item: item, data: item.data } ); //LEGACY
				}
			}
			else
			{
				//mark as selected
				that.markAsSelected( node );

				that._skip_scroll = true; //avoid scrolling while user clicks something
				LiteGUI.trigger( that, "item_selected", { item: node, data: node.data } );
				LiteGUI.trigger( that.root, "item_selected", { item: node, data: node.data } ); //LEGACY
				var r = false;
				if(data.callback) 
					r = data.callback.call(that,node);

				if(!r && that.onItemSelected)
					that.onItemSelected(node.data, node);
				that._skip_scroll = false;
			}
		}

		function onNodeDblClicked(e)
		{
			var node = this; //this.parentNode;
			var title = node.title_element.querySelector(".incontent");

			LiteGUI.trigger( that, "item_dblclicked", node );
			LiteGUI.trigger( that.root, "item_dblclicked", node ); //LEGACY

			if(!title._editing && that.options.allow_rename)
			{
				title._editing = true;
				title._old_name = title.innerHTML;
				var that2 = title;
				title.innerHTML = "<input type='text' value='" + title.innerHTML + "' />";
				var input = title.querySelector("input");

				//loose focus when renaming
				input.addEventListener("blur",function(e) { 
					var new_name = e.target.value;
					setTimeout(function() { that2.innerHTML = new_name; },1); //bug fix, if I destroy input inside the event, it produce a NotFoundError
					//item.node_name = new_name;
					delete that2._editing;
					LiteGUI.trigger( that.root, "item_renamed", { old_name: that2._old_name, new_name: new_name, item: node, data: node.data } );
					delete that2._old_name;
				});

				//finishes renaming
				input.addEventListener("keydown", function(e) {
					if(e.keyCode != 13)
						return;
					this.blur();
				});

				//set on focus
				input.focus();

				e.preventDefault();
			}
			
			e.preventDefault();
			e.stopPropagation();
		}

		//dragging element on tree
		var draggable_element = title_element;
		if(this.options.allow_drag)
		{
			draggable_element.draggable = true;

			//starts dragging this element
			draggable_element.addEventListener("dragstart", function(ev) {
				//this.removeEventListener("dragover", on_drag_over ); //avoid being drag on top of himself
				//ev.dataTransfer.setData("node-id", this.parentNode.id);
				ev.dataTransfer.setData("item_id", this.parentNode.dataset["item_id"]);
				if(!data.onDragData)
					return;

				var drag_data =	data.onDragData();
				if(drag_data)
				{
					for(var i in drag_data)
						ev.dataTransfer.setData(i,drag_data[i]);
				}
			});
		}

		var count = 0;

		//something being dragged entered
		draggable_element.addEventListener("dragenter", function (ev)
		{
			ev.preventDefault();
			if(data.skipdrag)
				return false;
			
			if(count == 0)
				title_element.classList.add("dragover");
			count++;
		});

		draggable_element.addEventListener("dragleave", function (ev)
		{
			ev.preventDefault();
			//console.log(data.id);
			count--;
			if(count == 0)
				title_element.classList.remove("dragover");
			//if(ev.srcElement == this) return;
		});

		//test if allows to drag stuff on top?
		draggable_element.addEventListener("dragover", on_drag_over );
		function on_drag_over(ev)
		{
			ev.preventDefault();
		}

		draggable_element.addEventListener("drop", function (ev)
		{
			title_element.classList.remove("dragover");
			ev.preventDefault();
			if(data.skipdrag)
				return false;

			var item_id = ev.dataTransfer.getData("item_id");

			//var data = ev.dataTransfer.getData("Text");
			if(!item_id)
			{
				LiteGUI.trigger( that.root, "drop_on_item", { item: this, event: ev });
				if( that.onDropItem )
					that.onDropItem( ev, this.parentNode.data );
				return;
			}

			//try
			{
				var parent_id = this.parentNode.dataset["item_id"];

				if( !that.onMoveItem || (that.onMoveItem && that.onMoveItem( that.getItem( item_id ), that.getItem( parent_id ) ) != false))
				{
					if( that.moveItem( item_id, parent_id ) )
						LiteGUI.trigger( that.root, "item_moved", { item: that.getItem( item_id ), parent_item: that.getItem( parent_id ) } );
				}
			}
			/*
			catch (err)
			{
				console.error("Error: " + err );
			}
			*/

			if( that.onDropItem )
				that.onDropItem( ev, this.parentNode.data );
		});

		return root;
	}


	/**
	* remove from the tree the items that do not have a name that matches the string
	* @method filterByName
	* @param {string} name
	*/
	Tree.prototype.filterByName = function(name)
	{
		for(var i = 0; i < this.root.childNodes.length; ++i)
		{
			var childNode = this.root.childNodes[i]; //ltreeitem
			if( !childNode.classList || !childNode.classList.contains("ltreeitem") )
				continue;

			var content = childNode.querySelector(".incontent");
			if(!content)
				continue;

			var str = content.innerHTML.toLowerCase();

			if(!name || str.indexOf( name.toLowerCase() ) != -1)
			{
				if( childNode.data && childNode.data.visible !== false )
					childNode.classList.remove("filtered");
				var indent = childNode.querySelector(".indentblock");
				if(indent)
				{
					if(name)
						indent.style.paddingLeft = 0;
					else
						indent.style.paddingLeft = paddingLeft = ( (parseInt(childNode.dataset["level"]) + this.indent_offset) * Tree.INDENT) + "px";
				}
			}
			else
			{
				childNode.classList.add("filtered");
			}
		}
	}	

	/**
	* remove from the tree the items that do not have a name that matches the string
	* @method filterByName
	* @param {string} name
	*/
	Tree.prototype.filterByRule = function( callback_to_filter, param )
	{
		if(!callback_to_filter)
			throw("filterByRule requires a callback");
		for(var i = 0; i < this.root.childNodes.length; ++i)
		{
			var childNode = this.root.childNodes[i]; //ltreeitem
			if( !childNode.classList || !childNode.classList.contains("ltreeitem") )
				continue;

			var content = childNode.querySelector(".incontent");
			if(!content)
				continue;

			if( callback_to_filter( childNode.data, content, param ) )
			{
				if( childNode.data && childNode.data.visible !== false )
					childNode.classList.remove("filtered");
				var indent = childNode.querySelector(".indentblock");
				if(indent)
				{
					if(name)
						indent.style.paddingLeft = 0;
					else
						indent.style.paddingLeft = paddingLeft = ( (parseInt(childNode.dataset["level"]) + this.indent_offset) * LiteGUI.Tree.INDENT) + "px";
				}
			}
			else
			{
				childNode.classList.add("filtered");
			}
		}
	}	


	/**
	* get the item with that id, returns the HTML element
	* @method getItem
	* @param {string} id
	* @return {Object}
	*/
	Tree.prototype.getItem = function( id )
	{
		if(!id)
			return null;

		if( id.classList ) //if it is already a node
			return id;

		for(var i = 0; i < this.root.childNodes.length; ++i)
		{
			var childNode = this.root.childNodes[i];
			if( !childNode.classList || !childNode.classList.contains("ltreeitem") )
				continue;

			if(childNode.dataset["item_id"] === id)
				return childNode;
		}

		return null;

		/*
		var safe_id = id.replace(/\s/g,"_");
		var node = this.root.querySelector(".ltreeitem-"+safe_id);
		if(!node) 
			return null;
		if( !node.classList.contains("ltreeitem") )
			throw("this node is not a tree item");
		return node;
		*/
	}

	/**
	* in case an item is collapsed, it expands it to show children
	* @method expandItem
	* @param {string} id
	*/
	Tree.prototype.expandItem = function(id, parents)
	{
		var item = this.getItem(id);
		if(!item)
			return;

		if(!item.listbox)
			return;

		item.listbox.setValue(true); //this propagates changes

		if(!parents)
			return;

		var parent = this.getParent( item );
		if(parent)
			this.expandItem(parent,parents);
	}

	/**
	* in case an item is expanded, it collapses it to hide children
	* @method collapseItem
	* @param {string} id
	*/
	Tree.prototype.collapseItem = function(id)
	{
		var item = this.getItem(id);
		if(!item)
			return;

		if(!item.listbox)
			return;

		listbox.setValue(false);  //this propagates changes
	}


	/**
	* Tells you if the item its out of the view due to the scrolling
	* @method isInsideArea
	* @param {string} id
	*/
	Tree.prototype.isInsideArea = function( id )
	{
		var item = id.constructor === String ? this.getItem(id) : id;
		if(!item)
			return false;

		var rects = this.root.getClientRects();
		if(!rects.length)
			return false;
		var r = rects[0];
		var h = r.height;
		var y = item.offsetTop;

		if( this.root.scrollTop < y && y < (this.root.scrollTop + h) )
			return true;
		return false;
	}

	/**
	* Scrolls to center this item
	* @method scrollToItem
	* @param {string} id
	*/
	Tree.prototype.scrollToItem = function(id)
	{
		var item = id.constructor === String ? this.getItem(id) : id;
		if(!item)
			return;

		var container = this.root.parentNode;

		if(!container)
			return;

		var rect = container.getBoundingClientRect();
		if(!rect)
			return;
		var h = rect.height;
		var x = ( parseInt( item.dataset["level"] ) + this.indent_offset) * Tree.INDENT + 50;

		container.scrollTop = item.offsetTop - (h * 0.5)|0;
		if( rect.width * 0.75 < x )
			container.scrollLeft = x;
		else
			container.scrollLeft = 0;
	}

	/**
	* mark item as selected
	* @method setSelectedItem
	* @param {string} id
	*/
	Tree.prototype.setSelectedItem = function( id, scroll, send_event )
	{
		if(!id)
		{
			//clear selection
			this.unmarkAllAsSelected();
			return;
		}

		var node = this.getItem(id);
		if(!node) //not found
			return null;

		//already selected
		if( node.classList.contains("selected") ) 
			return;

		this.markAsSelected(node);
		if( scroll && !this._skip_scroll )
			this.scrollToItem(node);

		//expand parents
		this.expandItem( node, true );

		if(send_event)
			LiteGUI.trigger( node, "click" );

		return node;
	}

	/**
	* adds item to selection (multiple selection)
	* @method addItemToSelection
	* @param {string} id
	*/
	Tree.prototype.addItemToSelection = function( id )
	{
		if(!id)
			return;

		var node = this.getItem(id);
		if(!node) //not found
			return null;

		this.markAsSelected(node, true);
		return node;
	}

	/**
	* remove item from selection (multiple selection)
	* @method removeItemFromSelection
	* @param {string} id
	*/
	Tree.prototype.removeItemFromSelection = function( id )
	{
		if(!id)
			return;
		var node = this.getItem(id);
		if(!node) //not found
			return null;
		node.classList.remove("selected");
	}

	/**
	* returns the first selected item (its HTML element)
	* @method getSelectedItem
	* @return {HTML}
	*/
	Tree.prototype.getSelectedItem = function()
	{
		return this.root.querySelector(".ltreeitem.selected");
	}

	/**
	* returns an array with the selected items (its HTML elements)
	* @method getSelectedItems
	* @return {HTML}
	*/
	Tree.prototype.getSelectedItems = function()
	{
		return this.root.querySelectorAll(".ltreeitem.selected");
	}

	/**
	* returns if an item is selected
	* @method isItemSelected
	* @param {string} id
	* @return {bool}
	*/
	Tree.prototype.isItemSelected = function(id)
	{
		var node = this.getItem( id );
		if(!node)
			return false;
		return this.isNodeSelected(node);
	}

	/**
	* returns the children of an item
	* @method getChildren
	* @param {string} id could be string or node directly
	* @param {bool} [only_direct=false] to get only direct children
	* @return {Array}
	*/
	Tree.prototype.getChildren = function(id, only_direct )
	{
		if( id && id.constructor !== String && id.dataset )
			id = id.dataset["item_id"];
		return this._findChildElements( id, only_direct );
	}

	/**
	* returns the parent of a item
	* @method getParent
	* @param {string} id
	* @return {HTML}
	*/
	Tree.prototype.getParent = function(id_or_node)
	{
		var element = this.getItem( id_or_node );
		if(element)
			return this.getItem( element.parent_id );
		return null;
	}

	/**
	* returns an array with all the ancestors
	* @method getAncestors
	* @param {string} id
	* @return {Array}
	*/
	Tree.prototype.getAncestors = function( id_or_node, result )
	{
		result = result || [];
		var element = this.getItem( id_or_node );
		if(element)
		{
			result.push( element );
			return this.getAncestors( element.parent_id, result );
		}
		return result;
	}

	/**
	* returns an array with all the ancestors
	* @method getAncestors
	* @param {string} id
	* @return {Array}
	*/
	Tree.prototype.isAncestor = function( child, node )
	{
		var element = this.getItem( child );
		if(!element)
			return false;
		var dest = this.getItem( node );
		var parent = this.getItem( element.parent_id );
		if(!parent)
			return false;
		if(parent == dest)
			return true;
		return this.isAncestor( parent, node );
	}

	/**
	* move item with id to be child of parent_id
	* @method moveItem
	* @param {string} id
	* @param {string} parent_id
	* @return {bool}
	*/
	Tree.prototype.moveItem = function( id, parent_id )
	{
		if(id === parent_id)
			return false;

		var node = this.getItem( id );
		var parent = this.getItem( parent_id );

		if( this.isAncestor( parent, node ) )
			return false;

		var parent_index = this._findElementIndex( parent );
		var parent_level = parseInt( parent.dataset["level"] );
		var old_parent = this.getParent( node );
		if(!old_parent)
		{
			console.error("node parent not found by id, maybe id has changed");
			return false;
		}
		var old_parent_level = parseInt( old_parent.dataset["level"] );
		var level_offset = parent_level - old_parent_level;

		if(!parent || !node)
			return false;

		if(parent == old_parent)
			return false;

		//replace parent info
		node.parent_id = parent_id;

		//get all children and subchildren and reinsert them in the new level
		var children = this.getChildren( node );
		if(children)
		{
			children.unshift( node ); //add the node at the beginning

			//remove all children
			for(var i = 0; i < children.length; i++)
				children[i].parentNode.removeChild( children[i] );

			//update levels
			for(var i = 0; i < children.length; i++)
			{
				var child = children[i];
				var new_level = parseInt(child.dataset["level"]) + level_offset;
				child.dataset["level"] = new_level;
			}

			//reinsert
			parent_index = this._findElementIndex( parent ); //update parent index
			var last_index = this._findElementLastChildIndex( parent_index );
			if(last_index == -1)
				last_index = 0;
			for(var i = 0; i < children.length; i++)
			{
				var child = children[i];
				this._insertInside( child, parent_index, last_index + i - 1, parseInt( child.dataset["level"] ) );
			}
		}
		
		//update collapse button
		this._updateListBox( parent );
		if(old_parent)
			this._updateListBox( old_parent );

		return true;
	}

	/**
	* remove item with given id
	* @method removeItem
	* @param {string} id
	* @return {bool}
	*/
	Tree.prototype.removeItem = function( id_or_node, remove_children )
	{
		var node = id_or_node;
		if(typeof(id_or_node) == "string")
			node = this.getItem( id_or_node );
		if(!node)
			return false;

		//get parent
		var parent = this.getParent( node );

		//get all descendants
		var child_nodes = null;
		if(remove_children)
			child_nodes = this.getChildren( node );

		//remove html element
		this.root.removeChild( node );

		//remove all children
		if( child_nodes )
		{
			for( var i = 0; i < child_nodes.length; i++ )
				this.root.removeChild( child_nodes[i] );
		}

		//update parent collapse button
		if(parent)
			this._updateListBox( parent );
		return true;
	}

	/**
	* update a given item with new data
	* @method updateItem
	* @param {string} id
	* @param {object} data
	*/
	Tree.prototype.updateItem = function(id, data)
	{
		var node = this.getItem(id);
		if(!node)
			return false;

		node.data = data;
		if(data.id)
			node.id = data.id; //this updateItemId ?
		if(data.content)
		{
			//node.title_element.innerHTML = "<span class='precontent'></span><span class='incontent'>" +  + "</span><span class='postcontent'></span>";
			var incontent = node.title_element.querySelector(".incontent");
			incontent.innerHTML = data.content;
		}

		return true;
	}

	/**
	* update a given item id and the link with its children
	* @method updateItemId
	* @param {string} old_id
	* @param {string} new_id
	*/
	Tree.prototype.updateItemId = function(old_id, new_id)
	{
		var node = this.getItem(old_id);
		if(!node)
			return false;

		var children = this.getChildren( old_id, true );
		node.id = new_id;

		for(var i = 0; i < children.length; ++i)
		{
			var child = children[i];
			child.parent_id = new_id;
		}

		return true;
	}


	/**
	* clears all the items
	* @method clear
	* @param {bool} keep_root if you want to keep the root item
	*/
	Tree.prototype.clear = function(keep_root)
	{
		if(!keep_root)
		{
			this.root.innerHTML = "";
			return;
		}

		var items = this.root.querySelectorAll(".ltreeitem");
		for(var i = 1; i < items.length; i++)
		{
			var item = items[i];
			this.root.removeChild( item );
		}
	}


	Tree.prototype.getNodeByIndex = function(index)
	{
		var items = this.root.querySelectorAll(".ltreeitem");
		return items[index];
	}

	//private ********************************

	Tree.prototype.unmarkAllAsSelected = function()
	{
		this.root.classList.remove("selected");
		var selected_array = this.root.querySelectorAll(".ltreeitem.selected");
		if(selected_array)
		{
			for(var i = 0; i < selected_array.length; i++)
				selected_array[i].classList.remove("selected");
		}
		var semiselected = this.root.querySelectorAll(".ltreeitem.semiselected");
		for(var i = 0; i < semiselected.length; i++)
			semiselected[i].classList.remove("semiselected");
	}

	Tree.prototype.isNodeSelected = function( node )
	{
		//already selected
		if( node.classList.contains("selected") ) 
			return true;
		return false;
	}

	Tree.prototype.markAsSelected = function( node, add_to_existing_selection )
	{
		//already selected
		if( node.classList.contains("selected") ) 
			return;

		//clear old selection
		if(!add_to_existing_selection)
			this.unmarkAllAsSelected();

		//mark as selected (it was node.title_element?)
		node.classList.add("selected");

		//go up and semiselect
		var parent = this.getParent( node );
		var visited = [];
		while(parent && visited.indexOf(parent) == -1)
		{
			parent.classList.add("semiselected");
			visited.push( parent );
			parent = this.getParent( parent );
		}
		/*
		var parent = node.parentNode.parentNode; //two elements per level
		while(parent && parent.classList.contains("ltreeitem"))
		{
			parent.title_element.classList.add("semiselected");
			parent = parent.parentNode.parentNode;
		}
		*/
	}

	//updates the widget to collapse
	Tree.prototype._updateListBox = function( node, options, current_level )
	{
		if(!node)
			return;

		var that = this;

		if(!node.listbox)
		{
			var pre = node.title_element.querySelector(".collapsebox");
			var box = LiteGUI.createLitebox(true, function(e) { 
				that.onClickBox(e, node);
				LiteGUI.trigger( that.root, "item_collapse_change", { item: node, data: box.getValue() } );
			});
			box.stopPropagation = true;
			box.setEmpty(true);
			pre.appendChild(box);
			node.listbox = box;
		}

		if( (options && options.collapsed) || current_level >= this.collapsed_depth )
			node.listbox.collapse();

		var child_elements = this.getChildren( node.dataset["item_id"] );
		if(!child_elements)
			return; //null

		if(child_elements.length)
			node.listbox.setEmpty(false);
		else
			node.listbox.setEmpty(true);
	}

	Tree.prototype.onClickBox = function(e, node)
	{
		var children = this.getChildren( node );

		if(!children)
			return;

		//update children visibility
		for(var i = 0; i < children.length; ++i)
		{
			var child = children[i];
			
			var child_parent = this.getParent( child );
			var visible = true;
			if( child_parent )
				visible = this._isNodeChildrenVisible(child_parent);
			if(visible)
				child.classList.remove("hidden");
			else
				child.classList.add("hidden");
		}
	}

	LiteGUI.Tree = Tree;
})();
//enclose in a scope
(function(){

	/****************** PANEL **************/
	function Panel(id, options)
	{
		this._ctor(id,options);
	}

	Panel.title_height = "20px";

	Panel.prototype._ctor = function(id, options)
	{
		if(!options && id && id.constructor !== String)
		{
			options = id;
			id = null;
		}

		options = options || {};

		this.content = options.content || "";

		var root = this.root = document.createElement("div");
		if(id)
			root.id = id;

		root.className = "litepanel " + (options.className || "");
		root.data = this;

		var code = "";
		if(options.title)
			code += "<div class='panel-header'>"+options.title+"</div>";
		code += "<div class='content'>"+this.content+"</div>";
		code += "<div class='panel-footer'></div>";
		root.innerHTML = code;

		if(options.title)
			this.header = this.root.querySelector(".panel-header");

		this.content = this.root.querySelector(".content");
		this.footer = this.root.querySelector(".panel-footer");

		if(options.width)
			this.root.style.width = LiteGUI.sizeToCSS( options.width );
		if(options.height)
			this.root.style.height = LiteGUI.sizeToCSS( options.height );
		if(options.position)
		{
			this.root.style.position = "absolute";
			this.root.style.left = LiteGUI.sizeToCSS( options.position[0] );
			this.root.style.top = LiteGUI.sizeToCSS( options.position[1] );
		}

		//if(options.scroll == false)	this.content.style.overflow = "hidden";
		if(options.scroll == true)
			this.content.style.overflow = "auto";
	}

	Panel.prototype.add = function( litegui_item )
	{
		this.content.appendChild( litegui_item.root );
	}

	Panel.prototype.clear = function()
	{
		while (this.content.firstChild)
			this.content.removeChild(this.content.firstChild);
	}

	LiteGUI.Panel = Panel;
})();
(function(){
	/****************** DIALOG **********************/
	/**
	* Dialog
	*
	* @class Dialog
	* @param {Object} options useful options are { title, width, height, closable, on_close, scroll }
	* @constructor
	*/
	function Dialog( options, legacy )
	{
		if( legacy || (options && options.constructor === String) )
		{
			var id = options;
			options = legacy || {};
			options.id = id;
			console.warn("LiteGUI.Dialog legacy parameter, use options as first parameter instead of id.");
		}

		this._ctor( options );
	}

	Dialog.MINIMIZED_WIDTH = 200;
	Dialog.title_height = "20px";

	Dialog.getDialog = function( id )
	{
		var element = document.getElementById( id );		
		if(!element)
			return null;
		return element.dialog;
	}

	Dialog.prototype._ctor = function( options )
	{
		options = options || {};

		var that = this;
		this.width = options.width;
		this.height = options.height;
		this.minWidth = options.minWidth || 150;
		this.minHeight = options.minHeight || 100;
		this.content = options.content || "";

		var panel = document.createElement("div");
		if(options.id)
			panel.id = options.id;

		panel.className = "litedialog " + (options.className || "");
		panel.data = this;
		panel.dialog = this;

		var code = "";
		if(options.title)
		{
			code += "<div class='panel-header'>"+options.title+"</div><div class='buttons'>";
			if(options.minimize){
				code += "<button class='litebutton mini-button minimize-button'>-</button>";
				code += "<button class='litebutton mini-button maximize-button' style='display:none'></button>";
			}
			if(options.hide)
				code += "<button class='litebutton mini-button hide-button'></button>";
			if(options.detachable)
				code += "<button class='litebutton mini-button detach-button'></button>";
			
			if(options.close || options.closable)
				code += "<button class='litebutton mini-button close-button'>"+ LiteGUI.special_codes.close +"</button>";
			code += "</div>";
		}

		code += "<div class='content'>"+this.content+"</div>";
		code += "<div class='panel-footer'></div>";
		panel.innerHTML = code;

		this.root = panel;
		this.content = panel.querySelector(".content");
		this.footer = panel.querySelector(".panel-footer");

		if(options.fullcontent)
		{
			this.content.style.width = "100%";		
			this.content.style.height = options.title ? "calc( 100% - "+Dialog.title_height+" )" : "100%";
		}

		if(options.buttons)
		{
			for(var i in options.buttons)
				this.addButton(options.buttons[i].name, options.buttons[i]);
		}

		//if(options.scroll == false)	this.content.style.overflow = "hidden";
		if(options.scroll == true)
			this.content.style.overflow = "auto";

		//buttons *********************************
		var close_button = panel.querySelector(".close-button");
		if(close_button)
			close_button.addEventListener("click", this.close.bind(this) );

		var maximize_button = panel.querySelector(".maximize-button");
		if(maximize_button)
			maximize_button.addEventListener("click", this.maximize.bind(this) );

		var minimize_button = panel.querySelector(".minimize-button");
		if(minimize_button)
			minimize_button.addEventListener("click", this.minimize.bind(this) );

		var hide_button = panel.querySelector(".hide-button");
		if(hide_button)
			hide_button.addEventListener("click", this.hide.bind(this) );

		var detach_button = panel.querySelector(".detach-button");
		if(detach_button)
			detach_button.addEventListener("click", function() { that.detachWindow(); });

		//size, draggable, resizable, etc
		this.enableProperties(options);

		this.root.addEventListener("DOMNodeInsertedIntoDocument", function(){ 
			if( that.on_attached_to_DOM )
				that.on_attached_to_DOM();
			if( that.on_resize )
				that.on_resize();
		});
		this.root.addEventListener("DOMNodeRemovedFromDocument", function(){ 
			if( that.on_detached_from_DOM )
				that.on_detached_from_DOM();
		});


		//attach
		if(options.attach || options.parent)
		{
			var parent = null;
			if(options.parent)
				parent = typeof(options.parent) == "string" ? document.querySelector(options.parent) : options.parent;
			if(!parent)
				parent = LiteGUI.root;
			parent.appendChild( this.root );
			this.center();
		}

		//if(options.position) //not docked
		//	this.setPosition( options.position[0], options.position[1] );
	}

	/**
	* add widget or html to the content of the dialog
	* @method add
	*/
	Dialog.prototype.add = function( litegui_item )
	{
		this.content.appendChild( litegui_item.root || litegui_item );
	}

	//takes the info from the parent to 
	Dialog.prototype.enableProperties = function(options)
	{
		options = options || {};
		var that = this;

		var panel = this.root;
		panel.style.position = "absolute";
		//panel.style.display = "none";

		panel.style.minWidth = this.minWidth + "px";
		panel.style.minHeight = this.minHeight + "px";

		if(this.width)
			panel.style.width = this.width + "px";

		if(this.height)
		{
			if(typeof(this.height) == "number")
			{
				panel.style.height = this.height + "px";
			}
			else
			{
				if(this.height.indexOf("%") != -1)
					panel.style.height = this.height;
			}

			this.content.style.height = "calc( " + this.height + "px - 24px )";
		}

		panel.style.boxShadow = "0 0 3px black";

		if(options.draggable)
		{
			this.draggable = true;
			LiteGUI.draggable( panel, panel.querySelector(".panel-header"), function(){
				that.bringToFront();
			},null, function(){
				return !that.minimized;
			});
		}

		if(options.resizable)
			this.setResizable();
	}

	Dialog.prototype.setResizable = function()
	{
		if(this.resizable)
			return;

		var root = this.root;
		this.resizable = true;
		var footer = this.footer;
		footer.style.minHeight = "4px";
		footer.classList.add("resizable");

		var corner = document.createElement("div");
		corner.className = "resizable-corner";
		this.root.appendChild( corner );

		footer.addEventListener("mousedown", inner_mouse);
		corner.addEventListener("mousedown", inner_mouse, true);

		var mouse = [0,0];
		var that = this;

		var is_corner = false;

		function inner_mouse(e)
		{
			//console.log( getTime(), is_corner );

			if(e.type == "mousedown")
			{
				document.body.addEventListener("mousemove", inner_mouse);
				document.body.addEventListener("mouseup", inner_mouse);
				is_corner = this == corner;
				mouse[0] = e.pageX;
				mouse[1] = e.pageY;
			}
			else if(e.type == "mousemove")
			{
				var rect = LiteGUI.getRect( root );
				var w = rect.width;
				var neww = w - (mouse[0] - e.pageX);
	
				var h = rect.height;
				var newh = h - (mouse[1] - e.pageY);

				if(is_corner)
					root.style.width = neww + "px";
				root.style.height = newh + "px";

				mouse[0] = e.pageX;
				mouse[1] = e.pageY;
				that.content.style.height = "calc( 100% - 24px )";

				if(that.on_resize && (w != neww || h != newh) )
					that.on_resize(e,neww,newh);
			}
			else if(e.type == "mouseup")
			{
				document.body.removeEventListener("mousemove", inner_mouse);
				document.body.removeEventListener("mouseup", inner_mouse);
				is_corner = false;
			}
			e.preventDefault();
			e.stopPropagation();
			return false;
		}
	}

	Dialog.prototype.dockTo = function( parent, dock_type )
	{
		if(!parent) return;
		var panel = this.root;

		dock_type = dock_type || "full";
		parent = parent.content || parent;

		panel.style.top = 0;
		panel.style.left = 0;

		panel.style.boxShadow = "0 0 0";

		if(dock_type == "full")
		{
			panel.style.position = "relative";
			panel.style.width = "100%";
			panel.style.height = "100%";
			this.content.style.width = "100%";
			this.content.style.height = "calc(100% - "+ LiteGUI.Panel.title_height +")"; //title offset: 20px
			this.content.style.overflow = "auto";
		}
		else if(dock_type == 'left' || dock_type == 'right')
		{
			panel.style.position = "absolute";
			panel.style.top = 0;
			panel.style[dock_type] = 0;

			panel.style.width = this.width + "px";
			panel.style.height = "100%";
			this.content.style.height = "calc(100% - "+ LiteGUI.Panel.title_height +")";
			this.content.style.overflow = "auto";

			if(dock_type == 'right')
			{
				panel.style.left = "auto";
				panel.style.right = 0;
			}
		}
		else if(dock_type == 'bottom' || dock_type == 'top')
		{
			panel.style.width = "100%";
			panel.style.height = this.height + "px";
			if(dock_type == 'bottom')
			{
				panel.style.bottom = 0;
				panel.style.top = "auto";
			}
		}

		if(this.draggable)
		{
			LiteGUI.draggable(panel);
		}
		

		if(parent.content)
			parent.content.appendChild(panel);
		else if( typeof(parent) == "string")
		{
			parent = document.querySelector( parent );
			if(parent)
				parent.appendChild( panel )
		}
		else
			parent.appendChild( panel ); 
	}

	Dialog.prototype.addButton = function(name,options)
	{
		options = options || {};
		if( options.constructor === Function )
			options = { callback: options };

		var that = this;
		var button = document.createElement("button");
		button.className = "litebutton";

		button.innerHTML = name;
		if(options.className)
			button.className += " " + options.className;

		this.root.querySelector(".panel-footer").appendChild( button );

		button.addEventListener("click", function(e) { 
			if(options.callback)
				options.callback(this);

			if(options.close)
				that.close();
		});

		return button;
	}

	/**
	* destroys the dialog
	* @method close
	*/
	Dialog.prototype.close = function() {
		LiteGUI.remove( this.root );
		LiteGUI.trigger( this, "closed", this);
		if(this.on_close)
			this.on_close();
		if(this.onclose)
			console.warn("Dialog: Do not use onclose, use on_close instead");
		if(this.dialog_window)
		{
			this.dialog_window.close();
			this.dialog_window = null;
		}
	}

	Dialog.prototype.highlight = function(time)
	{
		time = time || 100;
		this.root.style.outline = "1px solid white";
		var doc = this.root.ownerDocument;
		var w = doc.defaultView || doc.parentWindow;
		w.focus();
		setTimeout( (function(){
			this.root.style.outline = null;
		}).bind(this), time );
	}

	Dialog.minimized = [];

	Dialog.prototype.minimize = function() {
		if(this.minimized)
			return;

		this.minimized = true;
		this.old_box = this.root.getBoundingClientRect();

		this.root.querySelector(".content").style.display = "none";
		
		var minimize_button = this.root.querySelector(".minimize-button");
		if(minimize_button)	
			minimize_button.style.display = "none";

		var maximize_button = this.root.querySelector(".maximize-button");
		if(maximize_button)
			maximize_button.style.display = "";

		this.root.style.width = LiteGUI.Dialog.MINIMIZED_WIDTH + "px";

		LiteGUI.bind( this, "closed", function() {
			LiteGUI.Dialog.minimized.splice( LiteGUI.Dialog.minimized.indexOf( this ), 1);
			LiteGUI.Dialog.arrangeMinimized();
		});

		LiteGUI.Dialog.minimized.push( this );
		LiteGUI.Dialog.arrangeMinimized();

		LiteGUI.trigger( this,"minimizing" );
	}

	Dialog.arrangeMinimized = function()
	{
		for(var i in LiteGUI.Dialog.minimized)
		{
			var dialog = LiteGUI.Dialog.minimized[i];
			var parent = dialog.root.parentNode;
			var pos = parent.getBoundingClientRect().height - 20;
			dialog.root.style.left = LiteGUI.Dialog.MINIMIZED_WIDTH * i;
			dialog.root.style.top = pos + "px";
		}
	}

	Dialog.prototype.maximize = function() {
		if(!this.minimized)
			return;
		this.minimized = false;

		this.root.querySelector(".content").style.display = "";
		LiteGUI.draggable(this.root);
		this.root.style.left = this.old_box.left+"px";
		this.root.style.top = this.old_box.top + "px";
		this.root.style.width = this.old_box.width + "px";
		this.root.style.height = this.old_box.height + "px";

		var minimize_button = this.root.querySelector(".minimize-button");
		if(minimize_button)
			minimize_button.style.display = "";

		var maximize_button = this.root.querySelector(".maximize-button");
		if(maximize_button)
			maximize_button.style.display = "none";

		LiteGUI.Dialog.minimized.splice( LiteGUI.Dialog.minimized.indexOf( this ), 1);
		LiteGUI.Dialog.arrangeMinimized();
		LiteGUI.trigger( this, "maximizing" );
	}

	Dialog.prototype.makeModal = function()
	{
		LiteGUI.showModalBackground(true);
		LiteGUI.modalbg_div.appendChild( this.root ); //add panel
		this.show();
		this.center();

		LiteGUI.bind( this, "closed", inner );

		function inner(e)
		{
			LiteGUI.showModalBackground(false);
		}
	}

	Dialog.prototype.bringToFront = function()
	{
		var parent = this.root.parentNode;
		parent.removeChild(this.root);
		parent.appendChild(this.root);
	}

	/**
	* shows a hidden dialog
	* @method show
	*/
	Dialog.prototype.show = function( v, reference_element )
	{
		if(!this.root.parentNode)
		{
			if(!reference_element)
				LiteGUI.add( this );
			else
			{
				var doc = reference_element.ownerDocument;
				var parent = doc.querySelector(".litegui-wrap") || doc.body;
				parent.appendChild( this.root );
				var w = doc.defaultView || doc.parentWindow;
				w.focus();
			}
			this.center();
		}

		if(!this.detach_window)
		{
			this.root.style.display = "";
			LiteGUI.trigger( this, "shown" );
		}
	}

	/**
	* hides the dialog
	* @method hide
	*/
	Dialog.prototype.hide = function( v )
	{
		this.root.style.display = "none";
		LiteGUI.trigger(this, "hidden");
	}

	Dialog.prototype.fadeIn = function(time)
	{
		time = time || 1000;
		this.root.style.display = "";
		this.root.style.opacity = 0;
		var that = this;
		setTimeout(function(){
			that.root.style.transition = "opacity "+time+"ms";
			that.root.style.opacity = 1;
		},100);
	}

	Dialog.prototype.setPosition = function(x,y)
	{
		if(!this.root.parentNode)
			console.warn("LiteGUI.Dialog: Cannot set position of dialog if it is not in the DOM");
		this.root.position = "absolute";
		this.root.style.left = x + "px";
		this.root.style.top = y + "px";
	}

	Dialog.prototype.setSize = function( w, h )
	{
		this.root.style.width = typeof(w) == "number" ? w + "px" : w;
		this.root.style.height = typeof(h) == "number" ? h + "px" : h;
	}

	Dialog.prototype.setTitle = function(text)
	{
		if(!this.header)
			return;
		this.header.innerHTML = text;
	}

	Dialog.prototype.center = function()
	{
		if(!this.root.parentNode)
			return;

		this.root.position = "absolute";
		var width = this.root.offsetWidth;
		var height = this.root.offsetHeight;
		var parent_width = this.root.parentNode.offsetWidth;
		var parent_height = this.root.parentNode.offsetHeight;
		this.root.style.left = Math.floor(( parent_width - width ) * 0.5) + "px";
		this.root.style.top = Math.floor(( parent_height - height ) * 0.5) + "px";
	}

	/**
	* Adjust the size of the dialog to the size of the content
	* @method adjustSize
	* @param {number} margin
	*/
	Dialog.prototype.adjustSize = function( margin, skip_timeout )
	{
		margin = margin || 0;
		this.content.style.height = "auto";

		if(this.content.offsetHeight == 0 && !skip_timeout) //happens sometimes if the dialog is not yet visible
		{
			var that = this;
			setTimeout( function(){ that.adjustSize( margin, true ); }, 1 );
			return;
		}

		var extra = 0;
		var footer = this.root.querySelector(".panel-footer");
		if(footer)
			extra += footer.offsetHeight;

		var width = this.content.offsetWidth;
		var height = this.content.offsetHeight + 20 + margin + extra;

		this.setSize( width, height );
	}

	Dialog.prototype.clear = function()
	{
		this.content.innerHTML = "";
	}

	Dialog.prototype.detachWindow = function( on_complete, on_close )
	{
		if(this.dialog_window)
			return;

		//create window
		var rect = this.root.getClientRects()[0];
		var w = rect.width;
		var h = rect.height;
		var title = "Window";
		var header = this.root.querySelector(".panel-header");
		if(header)
			title = header.textContent;

		var dialog_window = window.open("","","width="+w+", height="+h+", location=no, status=no, menubar=no, titlebar=no, fullscreen=yes");
		dialog_window.document.write( "<head><title>"+title+"</title>" );
		this.dialog_window = dialog_window;

		//transfer style
		var styles = document.querySelectorAll("link[rel='stylesheet'],style");
		for(var i = 0; i < styles.length; i++)
			dialog_window.document.write( styles[i].outerHTML );
		dialog_window.document.write( "</head><body></body>" );
		dialog_window.document.close();

		var that = this;

		//closing event
		dialog_window.onbeforeunload = function(){
			var index = LiteGUI.windows.indexOf( dialog_window );
			if(index != -1)
				LiteGUI.windows.splice( index, 1 );
			if(on_close)
				on_close();
		}

		//move the content there
		dialog_window.document.body.appendChild( this.content );
		this.root.style.display = "none"; //hide
		this._old_height = this.content.style.height;
		this.content.style.height = "100%";

		LiteGUI.windows.push( dialog_window );

		if(on_complete)
			on_complete();

		return dialog_window;		
	}

	Dialog.prototype.reattachWindow = function( on_complete )
	{
		if(!this.dialog_window)
			return;

		this.root.appendChild( this.content );
		this.root.style.display = ""; //show
		this.content.style.height = this._old_height;
		delete this._old_height;
		this.dialog_window.close();
		var index = LiteGUI.windows.indexOf( this.dialog_window );
		if(index != -1)
			LiteGUI.windows.splice( index, 1 );
		this.dialog_window = null;
	}


	//*********************************************

	Dialog.showAll = function()
	{
		var dialogs = document.body.querySelectorAll("litedialog");
		for(var i = 0; i < dialogs.length; i++)
		{
			var dialog = dialogs[i];
			dialog.dialog.show();
		}
	}

	Dialog.hideAll = function()
	{
		var dialogs = document.body.querySelectorAll("litedialog");
		for(var i = 0; i < dialogs.length; i++)
		{
			var dialog = dialogs[i];
			dialog.dialog.hide();
		}
	}

	Dialog.closeAll = function()
	{
		var dialogs = document.body.querySelectorAll("litedialog");
		for(var i = 0; i < dialogs.length; i++)
		{
			var dialog = dialogs[i];
			dialog.dialog.close();
		}
	}

	LiteGUI.Dialog = Dialog;
})();
//enclose in a scope
(function(){


function Table( options )
{
	options = options || {};

	this.root = document.createElement("table");
	this.root.classList.add("litetable");

	this.columns = [];
	this.column_fields = [];
	this.rows = [];
	this.data = [];

	this._must_update_header = true;

	if(options.colums)
		this.setColumns(options.colums);

	if(options.scrollable)
		this.root.style.overflow = "auto";

	if(options.height)
		this.root.style.height = LiteGUI.sizeToCSS( options.height );

	if(options.columns)
		this.setColumns( options.columns );

	if(options.rows)
		this.setRows( options.data );
}

Table.prototype.setRows = function( data, reuse )
{
	this.data = data;
	this.updateContent( reuse );
}

Table.prototype.addRow = function( row, skip_add )
{
	var tr = document.createElement("tr");

	//create cells
	for(var j = 0; j < this.column_fields.length; ++j)
	{
		var td = document.createElement("td");

		var value = null;

		if(row.constructor === Array )
			value = row[ j ];
		else //object
			value = row[ this.column_fields[j] ];
		if(value === undefined)
			value = "";

		td.innerHTML = value;

		var column = this.columns[j];
		if(column === undefined)
			break;

		if(column.className)
			td.className = column.className;
		if(column.width)
			td.style.width = column.width;
		tr.appendChild( td );
	}

	this.root.appendChild( tr );
	this.rows.push( tr );
	if(!skip_add)
		this.data.push( row );

	return tr;
}

Table.prototype.updateRow = function( index, row )
{
	this.data[ index ] = row;

	var tr = this.rows[index];
	if(!tr)
		return;

	var cells = tr.querySelectorAll("td");
	for(var j = 0; j < cells.length; ++j)
	{
		var column = this.columns[j];

		var value = null;

		if(row.constructor === Array )
			value = row[ j ];
		else
			value = row[ column.field ];

		if(value === undefined)
			value = "";

		cells[j].innerHTML = value;
	}
	return tr;
}

Table.prototype.updateCell = function( row, cell, data )
{
	var tr = this.rows[ row ];
	if(!tr)
		return;
	var cell = tr.childNodes[cell];
	if(!cell)
		return;
	cell.innerHTML = data;
	return cell;
}


Table.prototype.setColumns = function( columns )
{
	this.columns.length = 0;
	this.column_fields.length = 0;

	var avg_width = ((Math.floor(100 / columns.length)).toFixed(1)) + "%";

	var rest = [];

	for(var i = 0; i < columns.length; ++i)
	{
		var c = columns[i];

		if( c === null || c === undefined )
			continue;

		//allow to pass just strings or numbers instead of objects
		if( c.constructor === String || c.constructor === Number )
			c = { name: String(c) };

		var column = {
			name: c.name || "",
			width: LiteGUI.sizeToCSS(c.width || avg_width),
			field: (c.field || c.name || "").toLowerCase(),
			className: c.className
		};

		//last
		if(i == columns.length - 1)
			column.width = " calc( 100% - ( " + rest.join(" + ") + " ) )";
		else
			rest.push( column.width );

		this.columns.push( column );
		this.column_fields.push( column.field );
	}

	this._must_update_header = true;
	this.updateContent();
}

Table.prototype.updateContent = function( reuse )
{
	this.root.innerHTML = "";

	//update header
	if(this._must_update_header)
	{
		this.header = document.createElement("tr");
		for(var i = 0; i < this.columns.length; ++i)
		{
			var column = this.columns[i];
			var th = document.createElement("th");
			th.innerHTML = column.name;
			if(column.width)
				th.style.width = column.width;
			column.th = th;
			this.header.appendChild( th );
		}
		this._must_update_header = false;
	}
	this.root.appendChild( this.header );

	if(!this.data)
		return;

	if(this.data.length != this.rows.length)
		reuse = false;

	if(reuse)
	{
		for(var i = 0; i < this.rows.length; ++i)
		{
			var data_row = this.data[i];
			var tr = this.updateRow( i, data_row );
			this.root.appendChild( tr );
		}
	}
	else
	{
		this.rows.length = 0;

		//create rows
		for(var i = 0; i < this.data.length; ++i)
		{
			var row = this.data[i];
			this.addRow( row, true );
		}
	}
}



LiteGUI.Table = Table;


})();
/**
* Inspector allows to create a list of widgets easily, it also provides methods to create the widgets automatically.<br/>
* Every widget is created calling the function add followed by the widget name, p.e. addSlider or addVector3 or addNumber.<br/>
* Widgets always receive three parameters:<br/>
* - name: String that defines the name at that it will be shown in the left side of the widget.<br/>
* - value: the value that will be displayed in the widget.<br/>
* - options: Object containing all the values .<br/>
*
* @class Inspector
* @param {Object} options object with a set of options { <br/>
	width: total width <br/>
	height: total height <br/>
	widgets_width: width of every widget (used mostly in horizontal inspectors) <br/>
	name_width: width of the name part of widgets <br/>
	full: set to true if you want the inspector to use all the parent width and height <br/>
	widgets_per_row: number of widgets per row, default is 1 but you can change it if you want to pack several widgets in a row (useful for small widgets like checkboxes) <br/>
	one_line: widgets are place one next to the other horizontaly <br/>
	onchange: callback to call when something changes <br/>
   } <br/>

	Dependencies: 
		- jscolor.js

* @constructor
*/

function Inspector( options )
{
	//for legacy code
	if(options && options.constructor === String)
	{
		var id = options;
		options = arguments[1] || {};
		options.id = id;
		console.warn("LiteGUI.Inspector legacy parameter, use options as first parameter instead of id.");
	}

	options = options || {};
	this.root = document.createElement("DIV");
	this.root.className = "inspector " + ( options.full ? "full" : "") + (options.className || "");
	if(options.one_line)
	{
		this.one_line = true;
		this.root.className += " one_line";
	}

	if(options.id)
		this.root.id = options.id;

	this.sections = [];
	this.values = {};
	this.widgets = [];
	this.widgets_by_name = {};
	this.row_number = 0; //used to detect if element is even (cannot use CSS, special cases everywhere)

	this.addContainer(); //add empty container
	this.tab_index = Math.floor(Math.random() * 10000);

	if(options.width)
		this.root.style.width = LiteGUI.sizeToCSS( options.width );
	if(options.height)
	{
		this.root.style.height = LiteGUI.sizeToCSS( options.height );
		if(!options.one_line)
			this.root.style.overflow = "auto";
	}

	if(options.name_width)
		this.name_width = options.name_width;
	if(options.widgets_width)
		this.widgets_width = options.widgets_width;

	if(options.noscroll)
		this.root.style.overflow = "hidden";

	if(options.onchange)
		this.onchange = options.onchange;

	if(options.parent)
		this.appendTo(options.parent);

	this.className = this.root.className;

	this.widgets_per_row = options.widgets_per_row || 1;
}

Inspector.prototype.getValues = function()
{
	var r = {};
	for(var i in this.widgets_by_name)
		r[i] = this.widgets_by_name[i].getValue();
	return r;
}

Inspector.prototype.setValues = function(v)
{
	for(var i in v)
		if( this.widgets_by_name[i] )
			this.widgets_by_name[i].setValue( v[i] );
}

//append the inspector to a parent
Inspector.prototype.appendTo = function( parent, at_front )
{
	if(!parent)
		return;
	if(parent.constructor === String)
		parent = document.querySelector(parent);
	if(!parent)
		return;
	if( at_front )
		parent.insertBefore( this.root, parent.firstChild );
	else
		parent.appendChild( this.root );
}

/**
* Removes all the widgets inside the inspector
* @method clear
*/
Inspector.prototype.clear = function()
{
	purgeElement( this.root, true ); //hack, but doesnt seem to work

	while(this.root.hasChildNodes())
		this.root.removeChild( this.root.lastChild );

	this.root.className = this.className;

	this.row_number = 0;
	this.values = {};
	this.widgets = [];
	this.widgets_by_name = {};
	this.sections = [];
	this.current_section = null;
	this._current_container = null;
	this._current_container_stack = null;
	this.addContainer();
}

/**
* Tryes to refresh (calls on_refresh)
* @method refresh
*/
Inspector.prototype.refresh = function()
{
	if(this.on_refresh)
		this.on_refresh();
}

// Append widget to this inspector (TODO: rename to appendWidget)
// + widget_parent
// + replace
Inspector.prototype.append = function( widget, options )
{
	options = options || {};

	var root = options.widget_parent || this._current_container || this.root;

	if(options.replace)
		options.replace.parentNode.replaceChild( widget, options.replace );
	else
	{
		widget.section = this.current_section;
		root.appendChild( widget );
	}
}

Inspector.prototype.pushContainer = function( container )
{
	if( !this._current_container_stack )
		this._current_container_stack = [ container ];
	else
	{
		if( this._current_container_stack.indexOf( container ) != -1 )
		{
			console.warn("Container already in the stack");
			return;
		}

		this._current_container_stack.push( container );
	}

	this._current_container = container;
}

Inspector.prototype.isContainerInStack = function( container )
{
	if(!this._current_container_stack)
		return false;
	if( this._current_container_stack.indexOf( container ) != -1 )
		return true;
	return false;
}

Inspector.prototype.popContainer = function( container )
{
	this.row_number = 0;
	if(this._current_container_stack && this._current_container_stack.length)
	{
		if(container)
		{
			var aux = this._current_container_stack.pop();
			while(aux && aux != container)
				aux = this._current_container_stack.pop();
		}
		else
		{
			this._current_container_stack.pop();
		}
		this._current_container = this._current_container_stack[ this._current_container_stack.length - 1 ];
	}
	else
		this._current_container = null;
}

Inspector.prototype.setup = function(info)
{
	for(var i in info)
	{
		var w = info[i];
		var widget = this.add( w.type, w.name, w.value, w.options );
	}
}

/**  Returns the widget given the name
*
* @method getWidget
* @param {String} name the name of the widget supplied when creating it or the number of the widget
* @return {Object} widget object
*/
Inspector.prototype.getWidget = function( name )
{
	if( name !== null && name.constructor === Number )
		return this.widgets[ name ];
	return this.widgets_by_name[ name ];
}

/**  Given an instance it shows all the attributes
*
* @method inspectInstance
* @param {Object} instance the instance that you want to inspect, attributes will be collected from this object
* @param {Array} properties an array with all the names of the properties you want to inspect, 
*		  if not specified then it calls getProperties, othewise collect them and tries to guess the type
* @param {Object} properties_info_example it overwrites the info about properties found in the object (in case the automaticaly guessed type is wrong)
* @param {Array} properties_to_skip this properties will be ignored
*/
Inspector.prototype.inspectInstance = function( instance, properties, properties_info_example, properties_to_skip ) 
{
	if(!instance)
		return;

	if( !properties )
	{	if( instance.getProperties )
			properties = instance.getProperties();
		else
			properties = this.collectProperties( instance );
	}
	else
	{
	}

	var classObject = instance.constructor;
	if(!properties_info_example && classObject.properties)
		properties_info_example = classObject.properties;

	//Properties info contains  name:type for every property
	//Must be cloned to ensure there is no overlap between widgets reusing the same container
	var properties_info = {};

	if( instance.getInspectorProperties )
		properties_info = instance.getInspectorProperties();
	else
	{
		//add to properties_info the ones that are not specified 
		for(var i in properties)
		{
			if( properties_info_example && properties_info_example[i] )
			{
				//clone
				properties_info[i] = inner_clone( properties_info_example[i] );
				continue;
			}

			var v = properties[i];

			if(classObject["@" + i]) //guess from class object info
			{
				var shared_options = classObject["@" + i];
				if( shared_options && shared_options.widget === null)
					continue; //skip
				properties_info[i] = inner_clone( shared_options );
			}
			else if(instance["@" + i]) //guess from instance info
				properties_info[i] = instance["@" + i];
			else if(v === null || v === undefined) //are you sure?
				continue;
			else 
			{
				switch( v.constructor )
				{
					case Number: properties_info[i] = { type: "number", step: 0.1 }; break;
					case String: properties_info[i] = { type: "string" }; break;
					case Boolean: properties_info[i] = { type: "boolean" }; break;
					default:
						if( v && (v.constructor === Array || v.constructor.BYTES_PER_ELEMENT) ) //Array or typed_array
						{
							var is_number = v[0] != null && v[0].constructor === Number;
							switch(v.length)
							{
								case 2: properties_info[i] = { type: is_number ? "vec2" : "Array", step: 0.1 }; break;
								case 3: properties_info[i] = { type: is_number ? "vec3" : "Array", step: 0.1 }; break;
								case 4: properties_info[i] = { type: is_number ? "vec4" : "Array", step: 0.1 }; break;
								default: 
									properties_info[i] = { type: "Array" }; break;
									continue;
							}
						}
				}
			}
		}
	}

	if(properties_to_skip)
		for(var i in properties_to_skip)
			delete properties_info[ properties_to_skip[i] ];

	//allows to establish the order of the properties in the inspector
	if(classObject.properties_order)
	{
		var sorted_properties = {};
		for(var i in classObject.properties_order)
		{
			var name = classObject.properties_order[i];
			if( properties_info[ name ] )
				sorted_properties[ name ] = properties_info[ name ];
			else
				console.warn("property not found in instance:", name );
		}
		for(var i in properties_info) //add the missing ones at the end (should this be optional?)
		{
			if( !sorted_properties[i] )
				sorted_properties[i] = properties_info[i];
		}
		properties_info = sorted_properties;
	}


	//showAttributes doesnt return anything but just in case...
	return this.showProperties( instance, properties_info );

	//basic cloner
	function inner_clone(original, target)
	{
		target = target || {};
		for(var j in original)
			target[j] = original[j];
		return target;
	}
}

/**  extract all attributes from an instance (enumerable properties that are not function and a name starting with alphabetic character)
*
* @method collectPropertier
* @param {Object} instance extract enumerable and public (name do not start with '_' ) properties from an object
* return {Object} object with "name" : value for every property
**/
Inspector.prototype.collectProperties = function( instance )
{
	var properties = {};

	for(var i in instance)
	{
		if(i[0] == "_" || i[0] == "@" || i.substr(0,6) == "jQuery") //skip vars with _ (they are private)
			continue;

		var v = instance[i];
		if ( v && v.constructor == Function && !instance.constructor["@" + i])
			continue;
		properties[i] = v;
	}
	return properties;
}

/** Adds the widgets for the properties specified in properties_info of instance, it will create callback and callback_update
*
* @method showProperties
* @param {Object} instance the instance that you want to inspect
* @param {Object} properties_info object containing   "property_name" :{ type: value, widget:..., min:..., max:... }  or just "property":"type"
* @param {Array} properties_to_skip this properties will be ignored
*/
Inspector.prototype.showProperties = function( instance, properties_info ) 
{
	//for every enumerable property create widget
	for(var i in properties_info)
	{
		var varname = i;
		var options = properties_info[i];
		if(!options)
			continue;
		if(options.constructor === String) //it allows to just specify the type
			options = { type: options };
		if(options.name)
			varname = options.name;
		if(!options.callback) //generate default callback to modify data
		{
			var o = { instance: instance, name: varname, options: options };
			if(options.type == "function")
			{
			}
			else
				options.callback = Inspector.assignValue.bind( o );

		}
		if(!options.callback_update) //generate default refresh
		{
			var o = { instance: instance, name: varname };
			options.callback_update = (function(){ return this.instance[ this.name ]; }).bind(o);
		}

		options.instance = instance;
		options.varname = varname;

		var type = options.widget || options.type || "string";

		//used to hook stuff on special occasions
		if( this.on_addProperty )
			this.on_addProperty( type, instance, varname, instance[varname], options );
		this.add( type, varname, instance[varname], options );
	}

	//extra widgets inserted by the object (stored in the constructor)
	if(instance.constructor.widgets)
		for(var i in instance.constructor.widgets)
		{
			var w = instance.constructor.widgets[i];
			this.add( w.widget, w.name, w.value, w );
		}

	//used to add extra widgets at the end
	if(instance.onShowProperties)
		instance.onShowProperties(this);
	if(instance.constructor.onShowProperties)
		instance.constructor.onShowProperties(instance, this);
}

/**
* Tryes to assigns a value to the instance stored in this.instance
* @method assignValue
*/
Inspector.assignValue = function(value)
{
	var instance = this.instance;
	var current_value = instance[ this.name ];

	if(current_value == null || value == null || this.options.type == "enum")
		instance[this.name] = value;
	else if(typeof(current_value) == "number")
		instance[this.name] = parseFloat(value);
	else if(typeof(current_value) == "string")
		instance[this.name] = value;
	else if( value && value.length && current_value && current_value.length && 
		( !Object.getOwnPropertyDescriptor( instance, this.name ) || !Object.getOwnPropertyDescriptor( instance, this.name ).set ) &&  //no setters
		( !Object.getOwnPropertyDescriptor( instance.__proto__, this.name ) || !Object.getOwnPropertyDescriptor( instance.__proto__, this.name ).set ) ) 
	{
		for(var i = 0; i < value.length; ++i)
			current_value[i] = value[i];
	}
	else
		instance[ this.name ] = value;
}

/**
* Used by all widgets to create the container of one widget
* @method createWidget
* @param {string} name the string to show at the left side of the widget, if null this element wont be created and the value part will use the full width
* @param {string} content the string with the html of the elements that conform the interactive part of the widget
* @param {object} options some generic options that any widget could have:
* - widget_name: the name used to store this widget in the widgets_by_name container, if omited the parameter name is used
* - width: the width of the widget (if omited it will use the Inspector widgets_width, otherwise 100%
* - name_width: the width of the name part of the widget, if not specified it will use Inspector name_width, otherwise css default
* - content_width: the width of the widget content area
* - pre_title: string to append to the left side of the name, this is helpful if you want to add icons with behaviour when clicked
* - title: string to replace the name, sometimes you want to supply a different name than the one you want to show (this is helpful to retrieve values from an inspector)
*/
Inspector.prototype.createWidget = function( name, content, options ) 
{
	options = options || {};
	content = (content === undefined || content === null) ? "" : content;
	var element = document.createElement("DIV");
	element.className = "widget " + (options.className || "");
	element.inspector = this;
	element.options = options;
	element.name = name;
	
	this.row_number += this.widgets_per_row;
	if(this.row_number % 2 == 0)
		element.className += " even";

	var width = options.width || this.widgets_width;
	if( width )
	{
		element.style.width = LiteGUI.sizeToCSS( width );
		if(!element.style.width)
			element.style.width = "calc(" + LiteGUI.sizeToCSS( width ) + ")";
		element.style.minWidth = "auto";
	}
	var height = options.height || this.height;
	if( height )
	{
		element.style.height = LiteGUI.sizeToCSS( height );
		if(!element.style.height)
			element.style.height = "calc(" + LiteGUI.sizeToCSS( height ) + ")";
		element.style.minHeight = "auto";
	}

	//store widgets 
	this.widgets.push( element );
	if(options.widget_name || name)
		this.widgets_by_name[ options.widget_name || name ] = element;

	if(this.widgets_per_row != 1)
	{
		if(!options.width)
			element.style.width = (100 / this.widgets_per_row).toFixed(2) + "%";
		element.style.display = "inline-block";
	}

	var namewidth = "";
	var contentwidth = "";
	if( (name !== undefined && name !== null) && (this.name_width || options.name_width) && !this.one_line)
	{
		var w = LiteGUI.sizeToCSS( options.name_width || this.name_width );
		namewidth = "style='width: calc(" + w + " - 0px); width: -webkit-calc(" + w + " - 0px); width: -moz-calc(" + w + " - 0px); '"; //hack 
		contentwidth = "style='width: calc( 100% - " + w + "); width: -webkit-calc(100% - " + w + "); width: -moz-calc( 100% - " + w + "); '";
	}

	if(options.name_width)
		namewidth = "style='width: "+ LiteGUI.sizeToCSS(options.name_width)+" '";
	if(options.content_width)
		contentwidth = "style='width: "+ LiteGUI.sizeToCSS(options.content_width)+" '";

	var code = "";
	var pretitle = "";
	var filling = this.one_line ? "" : "<span class='filling'></span>";

	if(options.pretitle)
		pretitle = options.pretitle;

	var content_class = "wcontent ";
	var title = name;
	if(options.title)
		title = options.title;
	if( name === null || name === undefined )
		content_class += " full";
	else if(name === "") //three equals because 0 == "" 
		code += "<span class='wname' title='"+title+"' "+namewidth+">"+ pretitle +"</span>";
	else
		code += "<span class='wname' title='"+title+"' "+namewidth+">"+ pretitle + name + filling + "</span>";

	if( content.constructor === String || content.constructor === Number || content.constructor === Boolean )
		element.innerHTML = code + "<span class='info_content "+content_class+"' "+contentwidth+">"+content+"</span>";
	else
	{
		element.innerHTML = code + "<span class='info_content "+content_class+"' "+contentwidth+"></span>";
		var content_element = element.querySelector("span.info_content");
		if(content_element)
			content_element.appendChild( content );
	}

	element.content = element.querySelector("span.info_content");
	element.remove = function() { 
		if( this.parentNode ) 
			this.parentNode.removeChild( this );
	};

	return element;
}

//calls callback, triggers wchange, calls onchange in Inspector
Inspector.onWidgetChange = function( element, name, value, options, expand_value, event )
{
	var section = element.section; //this.current_section

	if(!options.skip_wchange)
	{
		if(section)
			LiteGUI.trigger( section, "wbeforechange", value );
		LiteGUI.trigger( element, "wbeforechange", value );
	}

	//assign and launch callbacks
	this.values[ name ] = value;
	var r = undefined;
	if(options.callback)
	{
		if(expand_value)
			r = options.callback.apply( element, value );
		else
			r = options.callback.call( element, value, event );
	}

	if(!options.skip_wchange)
	{
		if(section)
			LiteGUI.trigger( section, "wchange", value, element );
		LiteGUI.trigger( element, "wchange", value, element );
	}

	if(this.onchange) 
		this.onchange(name, value, element);
	return r;
}

//must be lowercase
Inspector.widget_constructors = {
	"null": 'addNull', //use for special cases
	title: 'addTitle',
	info: 'addInfo',
	"default": 'addDefault', //it guesses
	number: 'addNumber',
	slider: 'addSlider',
	string: 'addString',
	text: 'addString',
	textarea: 'addTextarea',
	color: 'addColor',
	"boolean": 'addCheckbox', 
	checkbox: 'addCheckbox',
	icon: 'addIcon',
	vec2: 'addVector2',
	vector2: 'addVector2',
	vec3: 'addVector3',
	vector3: 'addVector3',
	vec4: 'addVector4',
	vector4: 'addVector4',
	"enum": 'addCombo',
	dropdown: 'addCombo',
	combo: 'addCombo',
	button: 'addButton',
	buttons: 'addButtons',
	file: 'addFile',
	line: 'addLine',
	list: 'addList',
	tree: 'addTree',
	datatree: 'addDataTree',
	pad: 'addPad',
	array: 'addArray',
	separator: 'addSeparator'
};


Inspector.registerWidget = function(name, callback)
{
	var func_name = "add" + name.charAt(0).toUpperCase() + name.slice(1);
	Inspector.prototype[func_name] = callback;
	Inspector.widget_constructors[name] = func_name;
}


/**
* Adds a widgete to the inspector, its a way to provide the widget type from a string
* @method add
* @param {string} type string specifying the name of the widget to use (check Inspector.widget_constructors for a complete list)
* @param {string} name the string to show at the left side of the widget, if null this element wont be created and the value part will use the full width
* @param {string} value the value to assign to the widget
* @param {object} options: some generic options that any widget could have:
* - type: overwrites the type
* - callback: function to call when the user interacts with the widget and changes the value
* [For a bigger list check createWidget and every widget in particular]
* @return {HTMLElement} the widget in the form of the DOM element that contains it
**/
Inspector.prototype.add = function( type, name, value, options )
{
	if(!type)
		throw("Inspector: no type specified");

	//type could be an object with every parameter contained inside
	if( arguments.length == 1 && typeof(type) == "object" )
	{
		options = type;
		type = options.type;
		name = options.name;
		value = options.value;
	}

	var func = LiteGUI.Inspector.widget_constructors[type.toLowerCase()];
	if(!func){
		console.warn("LiteGUI.Inspector do not have a widget called",type);
		return;
	}

	if( func.constructor === String )
		func = LiteGUI.Inspector.prototype[func];
	if( !func )
		return;
	if( func.constructor !== Function )
		return;

	if( options && options.constructor === Function )
		options = { callback: options };
	
	return func.call( this, name,value, options );
}

Inspector.prototype.getValue = function(name)
{
	return this.values[name];
}


Inspector.prototype.applyOptions = function( element, options )
{
	if(!element || !options)
		return;

	if(options.className)
		element.className += " " + options.className;
	if(options.id)
		element.id = options.id;
	if(options.width)
		element.style.width = LiteGUI.sizeToCSS( options.width );
	if(options.height)
		element.style.height = LiteGUI.sizeToCSS( options.height );
}


/**
* Creates a line
* @method addSeparator
* @return {HTMLElement} the widget in the form of the DOM element that contains it
**/
Inspector.prototype.addSeparator = function()
{
	var element = document.createElement("DIV");
	element.className = "separator";
	this.append(element);
	return element;
}

//used when you want to skip the widget of an object
Inspector.prototype.addNull = function(name,value, options)
{
	return null;
}

//used when you dont know which widget to use
Inspector.prototype.addDefault = function( name, value, options)
{
	if(value === null || value === undefined) //can we guess it from the current value?
		return null;

	if( value.constructor === Boolean )
		return this.addCheckbox( name, value, options );
	else if( value.constructor === String )
		return this.addString( name, value, options );
	else if( value.constructor === Number )
		return this.addNumber( name, value, options );
	else if( value.length == 4)
		return this.addVector4( name, value, options );
	else if( value.length == 3)
		return this.addVector3( name, value, options );
	else if( value.length == 2)
		return this.addVector2( name, value, options );
	return null;
}


/**
* Widget to edit strings
* @method addString
* @param {string} name 
* @param {string} value
* @param {Object} options, here is a list for this widget (check createWidget for a list of generic options):
* - focus: true if you want the cursor to be here
* - password: true if you want to hide the string 
* - immediate: calls the callback once every keystroke
* - disabled: shows the widget disabled
* - callback: function to call when the widget changes
* @return {HTMLElement} the widget in the form of the DOM element that contains it
**/
Inspector.prototype.addString = function(name,value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;

	var inputtype = "text";
	if(options.password) 
		inputtype = "password";
	var focus = options.focus ? "autofocus" : "";

	var element = this.createWidget(name,"<span class='inputfield full "+(options.disabled?"disabled":"")+"'><input type='"+inputtype+"' tabIndex='"+this.tab_index+"' "+focus+" class='text string' value='"+value+"' "+(options.disabled?"disabled":"")+"/></span>", options);
	var input = element.querySelector(".wcontent input");

	if(options.placeHolder)
		input.setAttribute("placeHolder",options.placeHolder);

	if(options.align == "right")
	{
		input.style.direction = "rtl";
		//input.style.textAlign = "right";
	}

	input.addEventListener( options.immediate ? "keyup" : "change", function(e) { 
		var r = Inspector.onWidgetChange.call(that, element, name, e.target.value, options);
		if(r !== undefined)
			this.value = r;
	});

	if(options.callback_enter)
		input.addEventListener( "keydown" , function(e) { 
			if(e.keyCode == 13)
			{
				var r = Inspector.onWidgetChange.call(that, element, name, e.target.value, options);
				options.callback_enter();
				e.preventDefault();
			}
		});

	this.tab_index += 1;

	element.setIcon = function(img)
	{
		if(!img)
		{
			input.style.background = "";
			input.style.paddingLeft = "";
		}
		else
		{
			input.style.background = "transparent url('"+img+"') no-repeat left 4px center";
			input.style.paddingLeft = "1.7em";
		}
	}
	if(options.icon)
		element.setIcon( options.icon );

	element.setValue = function(v, skip_event) { 
		if(v === undefined )
			return;
		if(v === input.value)
			return;
		input.value = v; 
		if(!skip_event)
			LiteGUI.trigger(input, "change" );
	};
	element.getValue = function() { return input.value; };
	element.focus = function() { this.querySelector("input").focus(); };
	element.disable = function() { input.disabled = true; };
	element.enable = function() { input.disabled = false; };
	this.append(element,options);
	this.processElement(element, options);
	return element;
}

/**
* Widget to edit strings, but it adds a button behind (useful to search values somewhere in case the user do not remember the name)
* @method addStringButton
* @param {string} name 
* @param {string} value the string to show
* @param {Object} options, here is a list for this widget (check createWidget for a list of generic options):
* - disabled: shows the widget disabled
* - button: string to show inside the button, default is "..."
* - callback: function to call when the string is edited
* - callback_button: function to call when the button is pressed
* @return {HTMLElement} the widget in the form of the DOM element that contains it
**/
Inspector.prototype.addStringButton = function( name, value, options)
{
	options = this.processOptions(options);

	if(value === undefined)
		value = "";
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget( name, "<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+value+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || "...")+"</button>", options);
	var input = element.querySelector(".wcontent input");
	input.addEventListener("change", function(e) { 
		var r = Inspector.onWidgetChange.call(that,element,name,e.target.value, options);
		if(r !== undefined)
			this.value = r;
	});

	element.setIcon = function(img)
	{
		if(!img)
		{
			input.style.background = "";
			input.style.paddingLeft = "";
		}
		else
		{
			input.style.background = "transparent url('"+img+"') no-repeat left 4px center";
			input.style.paddingLeft = "1.7em";
		}
	}
	if(options.icon)
		element.setIcon( options.icon );

	var button = element.querySelector(".wcontent button");
	button.addEventListener("click", function(e) { 
		if(options.callback_button)
			options.callback_button.call( element, input.value, e );
	});

	if(options.button_width)
	{
		button.style.width = LiteGUI.sizeToCSS( options.button_width );
		var inputfield = element.querySelector(".inputfield");
		inputfield.style.width = "calc( 100% - " + button.style.width + " - 6px)";
	}


	this.tab_index += 1;
	this.append(element,options);
	element.setValue = function(v, skip_event) { 
		input.value = v;
		if(!skip_event)
			LiteGUI.trigger(input, "change" );
	};
	element.disable = function() { input.disabled = true; button.disabled = true; };
	element.enable = function() { input.disabled = false; button.disabled = false; };
	element.getValue = function() { return input.value; };
	element.focus = function() { LiteGUI.focus(input); };
	this.processElement(element, options);
	return element;
}

/**
* Widget to edit strings with multiline support
* @method addTextarea
* @param {string} name 
* @param {string} value
* @param {Object} options, here is a list for this widget (check createWidget for a list of generic options):
* - focus: true if you want the cursor to be here
* - password: true if you want to hide the string 
* - immediate: calls the callback once every keystroke
* - disabled: shows the widget disabled
* - callback: function to call when the widget changes
* @return {HTMLElement} the widget in the form of the DOM element that contains it
**/
Inspector.prototype.addTextarea = function(name,value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;

	var element = this.createWidget(name,"<span class='inputfield textarea "+(options.disabled?"disabled":"")+"'><textarea tabIndex='"+this.tab_index+"' "+(options.disabled?"disabled":"")+"></textarea></span>", options);
	this.tab_index++;
	var textarea = element.querySelector(".wcontent textarea");
	textarea.value = value;
	textarea.addEventListener( options.immediate ? "keyup" : "change", function(e) { 
		Inspector.onWidgetChange.call(that,element,name,e.target.value, options, false, e);
	});
	if(options.callback_keydown)
		textarea.addEventListener( "keydown", options.callback_keydown );

	if(options.height)
		textarea.style.height = "calc( " + LiteGUI.sizeToCSS( options.height ) + " - 5px )";
		//textarea.style.height = LiteGUI.sizeToCSS( options.height );
	this.append(element,options);
	element.setValue = function(v, skip_event) { 
		if(v === undefined)
			return;
		if(v == textarea.value)
			return;
		value = v;
		textarea.value = v;
		if(!skip_event)
			LiteGUI.trigger( textarea,"change" );
	};
	element.getValue = function(v) { 
		return textarea.value;
	}
	element.focus = function() { LiteGUI.focus(textarea); };
	element.disable = function() { textarea.disabled = true;};
	element.enable = function() { textarea.disabled = false;};
	this.processElement(element, options);
	return element;
}

/**
* Widget to edit numbers (it adds a dragging mini widget in the right side)
* @method addNumber
* @param {string} name 
* @param {number} value 
* @param {Object} options, here is a list for this widget (check createWidget for a list of generic options):
* - disabled: shows the widget disabled
* - callback: function to call when the string is edited
* - precision: number of digits after the colon
* - units: string to show after the number
* - min: minimum value accepted
* - max: maximum value accepted
* - step: increments when draggin the mouse (default is 0.1)
* @return {HTMLElement} the widget in the form of the DOM element that contains it
**/
Inspector.prototype.addNumber = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || 0;
	var that = this;
	this.values[name] = value;

	var element = this.createWidget(name,"", options);
	this.append(element,options);

	options.extraclass = "full";
	options.tab_index = this.tab_index;
	//options.dragger_class = "full";
	options.full = true;
	options.precision = options.precision !== undefined ? options.precision : 2;
	options.step = options.step === undefined ? (options.precision == 0 ? 1 : 0.1) : options.step;

	this.tab_index++;
	
	var dragger = null;
	
	dragger = new LiteGUI.Dragger(value, options);
	dragger.root.style.width = "calc( 100% - 1px )";
	element.querySelector(".wcontent").appendChild( dragger.root );
	dragger.root.addEventListener("start_dragging", inner_before_change.bind(options) );
	element.dragger = dragger;

	if( options.disabled )
		dragger.input.setAttribute("disabled","disabled");

	function inner_before_change(e)
	{
		if(this.callback_before) 
			this.callback_before.call(element);
	}

	var input = element.querySelector("input");
	
	input.addEventListener("change", function(e) { 

		LiteGUI.trigger( element, "wbeforechange", e.target.value );

		that.values[name] = e.target.value;
		//Inspector.onWidgetChange.call(that,this,name,ret, options);

		if(options.callback)
		{
			var ret = options.callback.call( element, parseFloat( e.target.value) ); 
			if( typeof(ret) == "number")
				this.value = ret;
		}
		LiteGUI.trigger( element, "wchange", e.target.value );
		if(that.onchange)
			that.onchange(name,e.target.value,element);
	});

	element.setValue = function( v, skip_event) { 
		if(v === undefined)
			return;
		v = parseFloat(v);
		if(options.precision)
			v = v.toFixed( options.precision );
		v += (options.units || "");
		if(input.value == v)
			return;
		input.value = v;
		if(!skip_event)
			LiteGUI.trigger( input,"change" );
	};

	element.setRange = function(min,max) { dragger.setRange(min,max); }
	element.getValue = function() { return parseFloat( input.value ); };
	element.focus = function() { LiteGUI.focus(input); };
	element.disable = function() { input.disabled = true;};
	element.enable = function() { input.disabled = false;};
	this.processElement(element, options);
	return element;
}

/**
* Widget to edit two numbers (it adds a dragging mini widget in the right side)
* @method addVector2
* @param {string} name 
* @param {vec2} value 
* @param {Object} options, here is a list for this widget (check createWidget for a list of generic options):
* - callback: function to call once the value changes
* - disabled: shows the widget disabled
* - callback: function to call when the string is edited
* - precision: number of digits after the colon
* - units: string to show after the number
* - min: minimum value accepted
* - max: maximum value accepted
* - step: increments when draggin the mouse (default is 0.1)
* @return {HTMLElement} the widget in the form of the DOM element that contains it
**/
Inspector.prototype.addVector2 = function(name,value, options)
{
	options = this.processOptions(options);
	if(!options.step)
		options.step = 0.1;

	value = value || [0,0];
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"", options);

	options.step = options.step ||0.1;
	//options.dragger_class = "medium";
	options.tab_index = this.tab_index;
	options.full = true;
	this.tab_index++;

	var wcontent = element.querySelector(".wcontent");

	var dragger1 = new LiteGUI.Dragger(value[0], options);
	dragger1.root.style.marginLeft = 0;
	dragger1.root.style.width = "calc( 50% - 1px )";
	wcontent.appendChild( dragger1.root );

	options.tab_index = this.tab_index;
	this.tab_index++;

	var dragger2 = new LiteGUI.Dragger(value[1], options);
	dragger2.root.style.width = "calc( 50% - 1px )";
	wcontent.appendChild( dragger2.root );
	element.draggers = [dragger1,dragger2];

	LiteGUI.bind( dragger1.root ,"start_dragging", inner_before_change.bind(options) );
	LiteGUI.bind( dragger2.root, "start_dragging", inner_before_change.bind(options) );

	function inner_before_change(e)
	{
		if(this.callback_before) this.callback_before(e);
	}

	var inputs = element.querySelectorAll("input");
	for(var i = 0; i < inputs.length; ++i)
		inputs[i].addEventListener( "change" , function(e) { 

		//gather all three parameters
		var r = [];
		var elems = inputs;
		for(var i = 0; i < elems.length; i++)
			r.push( parseFloat( elems[i].value ) );

		LiteGUI.trigger( element, "wbeforechange", [r] );

		that.values[name] = r;

		if(options.callback)
		{
			var new_val = options.callback.call( element, r ); 
			
			if(typeof(new_val) == "object" && new_val.length >= 2)
			{
				for(var i = 0; i < elems.length; i++)
					elems[i].value = new_val[i];
				r = new_val;
			}
		}

		LiteGUI.trigger( element, "wchange", [r] );
		if(that.onchange)
			that.onchange(name,r,element);
	});

	this.append(element,options);

	element.setValue = function( v, skip_event) { 
		if(!v)
			return;
		if(dragger1.getValue() != v[0])
			dragger1.setValue(v[0],true);
		if(dragger2.getValue() != v[1])
			dragger2.setValue(v[1],skip_event); //last one triggers the event
	}
	element.setRange = function(min,max) { dragger1.setRange(min,max); dragger2.setRange(min,max); }
	this.processElement(element, options);
	return element;
}

/**
* Widget to edit two numbers (it adds a dragging mini widget in the right side)
* @method addVector3
* @param {string} name 
* @param {vec3} value 
* @param {Object} options, here is a list for this widget (check createWidget for a list of generic options):
* - callback: function to call once the value changes
* - disabled: shows the widget disabled
* - callback: function to call when the string is edited
* - precision: number of digits after the colon
* - units: string to show after the number
* - min: minimum value accepted
* - max: maximum value accepted
* - step: increments when draggin the mouse (default is 0.1)
* @return {HTMLElement} the widget in the form of the DOM element that contains it
**/
Inspector.prototype.addVector3 = function(name,value, options)
{
	options = this.processOptions(options);
	if(!options.step)
		options.step = 0.1;

	value = value || [0,0,0];
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"", options);

	options.step = options.step || 0.1;
	//options.dragger_class = "mini";
	options.tab_index = this.tab_index;
	options.full = true;
	this.tab_index++;

	var dragger1 = new LiteGUI.Dragger(value[0], options );
	dragger1.root.style.marginLeft = 0;
	dragger1.root.style.width = "calc( 33% - 1px )";
	element.querySelector(".wcontent").appendChild( dragger1.root );

	options.tab_index = this.tab_index;
	this.tab_index++;

	var dragger2 = new LiteGUI.Dragger(value[1], options );
	dragger2.root.style.width = "calc( 33% - 1px )";
	element.querySelector(".wcontent").appendChild( dragger2.root );

	options.tab_index = this.tab_index;
	this.tab_index++;

	var dragger3 = new LiteGUI.Dragger(value[2], options );
	dragger3.root.style.width = "calc( 33% - 1px )";
	element.querySelector(".wcontent").appendChild( dragger3.root );
	element.draggers = [dragger1,dragger2,dragger3];

	dragger1.root.addEventListener( "start_dragging", inner_before_change.bind(options) );
	dragger2.root.addEventListener( "start_dragging", inner_before_change.bind(options) );
	dragger3.root.addEventListener( "start_dragging", inner_before_change.bind(options) );

	function inner_before_change(e)
	{
		if(this.callback_before) this.callback_before();
	}

	var inputs = element.querySelectorAll("input");
	for(var i = 0; i < inputs.length; ++i)
		inputs[i].addEventListener("change", function(e) { 
		//gather all three parameters
		var r = [];
		var elems = inputs;
		for(var i = 0; i < elems.length; i++)
			r.push( parseFloat( elems[i].value ) );

		LiteGUI.trigger( element, "wbeforechange", [r] );

		that.values[name] = r;

		if(options.callback)
		{
			var new_val = options.callback.call( element,r ); 
			
			if(typeof(new_val) == "object" && new_val.length >= 3)
			{
				for(var i = 0; i < elems.length; i++)
					elems[i].value = new_val[i];
				r = new_val;
			}
		}

		LiteGUI.trigger( element, "wchange",[r]);
		if(that.onchange)
			that.onchange(name,r,element);
	});

	this.append(element,options);

	element.setValue = function( v, skip_event ) { 
		if(!v)
			return;
		dragger1.setValue(v[0],true);
		dragger2.setValue(v[1],true);
		dragger3.setValue(v[2],skip_event); //last triggers
	}
	element.setRange = function(min,max) { dragger1.setRange(min,max); dragger2.setRange(min,max); dragger3.setRange(min,max); }

	this.processElement(element, options);
	return element;
}

/**
* Widget to edit two numbers (it adds a dragging mini widget in the right side)
* @method addVector4
* @param {string} name 
* @param {vec4} value 
* @param {Object} options, here is a list for this widget (check createWidget for a list of generic options):
* - callback: function to call once the value changes
* - disabled: shows the widget disabled
* - callback: function to call when the string is edited
* - precision: number of digits after the colon
* - units: string to show after the number
* - min: minimum value accepted
* - max: maximum value accepted
* - step: increments when draggin the mouse (default is 0.1)
* @return {HTMLElement} the widget in the form of the DOM element that contains it
**/
Inspector.prototype.addVector4 = function(name,value, options)
{
	options = this.processOptions(options);
	if(!options.step)
		options.step = 0.1;

	value = value || [0,0,0];
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget( name,"", options );

	options.step = options.step || 0.1;
	//options.dragger_class = "mini";
	options.tab_index = this.tab_index;
	options.full = true;
	this.tab_index++;

	var draggers = element.draggers = [];

	for(var i = 0; i < 4; i++)
	{
		var dragger = new LiteGUI.Dragger(value[i], options );
		dragger.root.style.marginLeft = 0;
		dragger.root.style.width = "calc( 25% - 1px )";
		element.querySelector(".wcontent").appendChild( dragger.root );
		options.tab_index = this.tab_index;
		this.tab_index++;
		dragger.root.addEventListener("start_dragging", inner_before_change.bind(options) );
		draggers.push(dragger);
	}

	function inner_before_change(e)
	{
		if(this.callback_before)
			this.callback_before();
	}

	var inputs = element.querySelectorAll("input");
	for(var i = 0; i < inputs.length; ++i)
		inputs[i].addEventListener("change", function(e) { 
		//gather all parameters
		var r = [];
		var elems = inputs;
		for(var i = 0; i < elems.length; i++)
			r.push( parseFloat( elems[i].value ) );

		LiteGUI.trigger( element, "wbeforechange", [r] );

		that.values[name] = r;

		if(options.callback)
		{
			var new_val = options.callback.call( element, r ); 
			if(typeof(new_val) == "object" && new_val.length >= 4)
			{
				for(var i = 0; i < elems.length; i++)
					elems[i].value = new_val[i];
				r = new_val;
			}
		}

		LiteGUI.trigger( element, "wchange",[r]);
		if(that.onchange)
			that.onchange(name,r,element);
	});

	this.append(element,options);

	element.setValue = function( v, skip_event ) { 
		if(!v)
			return;
		for(var i = 0; i < draggers.length; i++)
			draggers[i].setValue(v[i],skip_event);
	}
	element.setRange = function(min,max) { for(var i in draggers) { draggers[i].setRange(min,max); } }

	this.processElement(element, options);
	return element;
}

/**
* Widget to edit two numbers using a rectangular pad where you can drag horizontaly and verticaly a handler
* @method addPad
* @param {string} name 
* @param {vec2} value 
* @param {Object} options, here is a list for this widget (check createWidget for a list of generic options):
* - callback: function to call once the value changes
* - disabled: shows the widget disabled
* - callback: function to call when the string is edited
* - precision: number of digits after the colon
* - units: string to show after the number
* - min: minimum value accepted
* - minx: minimum x value accepted
* - miny: minimum y value accepted
* - max: maximum value accepted
* - maxx: maximum x value accepted
* - maxy: maximum y value accepted
* - step: increments when draggin the mouse (default is 0.1)
* - background: url of image to use as background (it will be streched)
* @return {HTMLElement} the widget in the form of the DOM element that contains it
**/
Inspector.prototype.addPad = function(name,value, options)
{
	options = this.processOptions(options);
	if(!options.step)
		options.step = 0.1;

	value = value || [0,0];
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"", options);

	options.step = options.step ||0.1;
	//options.dragger_class = "medium";
	options.tab_index = this.tab_index;
	options.full = true;
	this.tab_index++;

	var minx = options.minx || options.min || 0;
	var miny = options.miny || options.min || 0;
	var maxx = options.maxx || options.max || 1;
	var maxy = options.maxy || options.max || 1;

	var wcontent = element.querySelector(".wcontent");

	var pad = document.createElement("div");
	pad.className = "litepad";
	wcontent.appendChild( pad );
	pad.style.width = "100%";
	pad.style.height = "100px";
	if (options.background)
	{
		pad.style.backgroundImage = "url('" + options.background + "')";
		pad.style.backgroundSize = "100%";
		pad.style.backgroundRepeat = "no-repeat";
	}

	var handler = document.createElement("div");
	handler.className = "litepad-handler";
	pad.appendChild( handler );

	options.tab_index = this.tab_index;
	this.tab_index++;

	var dragging = false;

	pad._onMouseEvent = function(e)
	{
		var b = pad.getBoundingClientRect();
		e.mousex = e.pageX - b.left;
		e.mousey = e.pageY - b.top;
		e.preventDefault();
		e.stopPropagation();

		if(e.type == "mousedown")
		{
			document.body.addEventListener("mousemove", pad._onMouseEvent );
			document.body.addEventListener("mouseup", pad._onMouseEvent );
			dragging = true;
		}
		else if(e.type == "mousemove")
		{
			var x = e.mousex / (b.width);
			var y = e.mousey / (b.height);

			x = x * (maxx - minx) + minx;
			y = y * (maxy - miny) + minx;

			var r = [x,y];

			LiteGUI.trigger( element, "wbeforechange", [r] );

			element.setValue(r);

			if(options.callback)
			{
				var new_val = options.callback.call( element, r ); 
				if( new_val && new_val.length >= 2)
				{
					for(var i = 0; i < elems.length; i++)
						element.setValue( new_val );
				}
			}
			
			LiteGUI.trigger( element, "wchange",[r]);
			if(that.onchange)
				that.onchange(name,r,element);
		}
		else if(e.type == "mouseup")
		{
			dragging = false;
			document.body.removeEventListener("mousemove", pad._onMouseEvent );
			document.body.removeEventListener("mouseup", pad._onMouseEvent );
		}

		return true;
	}

	pad.addEventListener("mousedown", pad._onMouseEvent );

	element.setValue = function(v,skip_event)
	{
		if(v === undefined)
			return;

		var b = pad.getBoundingClientRect();
		var x = (v[0] - minx) / (maxx - minx);
		var y = (v[1] - miny) / (maxy - miny);
		x = Math.max( 0, Math.min( x, 1 ) ); //clamp
		y = Math.max( 0, Math.min( y, 1 ) );

		//handler.style.left = (x * (b.width - 10)) + "px";
		//handler.style.top = (y * (b.height - 10)) + "px";
		var w = ((b.width - 10) / b.width) * 100;
		var h = ((b.height - 10) / b.height) * 100;
		handler.style.left = (x * w).toFixed(1) + "%";
		handler.style.top = (y * h).toFixed(1) + "%";

		//if(!skip_event)
		//	LiteGUI.trigger(this,"change");
	}

	this.append(element,options);

	element.setValue( value );

	this.processElement(element, options);
	return element;
}

/**
* Widget to show plain information in HTML (not interactive)
* @method addInfo
* @param {string} name 
* @param {string} value HTML code
* @param {Object} options, here is a list for this widget (check createWidget for a list of generic options):
* - className: to specify a classname of the content
* - height: to specify a height
* @return {HTMLElement} the widget in the form of the DOM element that contains it
**/
Inspector.prototype.addInfo = function( name, value, options)
{
	options = this.processOptions(options);

	value = (value === undefined || value === null) ? "" : value;
	var element = null;
	if(name != null)
		element = this.createWidget( name, value, options);
	else
	{
		element = document.createElement("div");
		if(options.className)
			element.className = options.className;
		if(value.nodeName !== undefined)
		{
			element.innerHTML = "<span class='winfo'></span>";
			element.childNodes[0].appendChild( value );
		}
		else
			element.innerHTML = "<span class='winfo'>"+value+"</span>";
	}

	var info = element.querySelector(".winfo") || element.querySelector(".wcontent");

	if(options.callback)
		element.addEventListener("click",options.callback.bind(element));

	element.setValue = function(v) { 
		if(v === undefined)
			return;
		if(info)
			info.innerHTML = v;
	};

	var content = element.querySelector("span.info_content");
	if(!content)
		content = element.querySelector(".winfo");

	if(options.width)
	{
		element.style.width = LiteGUI.sizeToCSS(options.width);
		element.style.display = "inline-block";
		if(!name)
			info.style.margin = "2px";
	}
	if(options.height)
	{
		content.style.height = LiteGUI.sizeToCSS(options.height);
		content.style.overflow = "auto";
	}

	element.scrollToBottom = function(){
		content.scrollTop = content.offsetTop;
	}

	element.add = function(e)
	{
		content.appendChild(e);
	}

	this.append(element,options);
	this.processElement(element, options);
	return element;
}

/**
* Widget to edit a number using a slider
* @method addSlider
* @param {string} name 
* @param {number} value 
* @param {Object} options, here is a list for this widget (check createWidget for a list of generic options):
* - min: min value
* - max: max value
* - step: increments when dragging
* - callback: function to call once the value changes
* @return {HTMLElement} the widget in the form of the DOM element that contains it
**/
Inspector.prototype.addSlider = function(name, value, options)
{
	options = this.processOptions(options);

	if(options.min === undefined)
		options.min = 0;

	if(options.max === undefined)
		options.max = 1;

	if(options.step === undefined)
		options.step = 0.01;

	var that = this;
	if(value === undefined || value === null)
		value = 0;
	this.values[name] = value;

	var element = this.createWidget(name,"<span class='inputfield full'>\
				<input tabIndex='"+this.tab_index+"' type='text' class='slider-text fixed nano' value='"+value+"' /><span class='slider-container'></span></span>", options);

	var slider_container = element.querySelector(".slider-container");

	var slider = new LiteGUI.Slider(value,options);
	slider_container.appendChild(slider.root);

	//Text change -> update slider
	var skip_change = false; //used to avoid recursive loops
	var text_input = element.querySelector(".slider-text");
	text_input.addEventListener('change', function(e) {
		if(skip_change)
			return;
		var v = parseFloat( this.value );
		value = v;
		slider.setValue( v );
		Inspector.onWidgetChange.call( that,element,name,v, options );
	});

	//Slider change -> update Text
	slider.onChange = function(value) {
		text_input.value = value;
		Inspector.onWidgetChange.call( that, element, name, value, options);
	};

	this.append(element,options);

	element.setValue = function(v,skip_event) { 
		if(v === undefined)
			return;
		value = v;
		slider.setValue(v,skip_event);
	};
	element.getValue = function() { 
		return value;
	};

	this.processElement(element, options);
	return element;
}

/**
* Widget to edit a boolean value using a checkbox
* @method addCheckbox
* @param {string} name 
* @param {boolean} value 
* @param {Object} options, here is a list for this widget (check createWidget for a list of generic options):
* - label: text to show, otherwise it shows on/off
* - label_on: text to show when on
* - label_off: text to show when off
* - callback: function to call once the value changes
* @return {HTMLElement} the widget in the form of the DOM element that contains it
**/
Inspector.prototype.addCheckbox = function(name, value, options)
{
	options = this.processOptions(options);
	value = !!value;
	var that = this;
	this.values[name] = value;

	var label_on = options.label_on || options.label || "on";
	var label_off = options.label_off || options.label || "off";
	var label = (value ? label_on : label_off);
	
	//var element = this.createWidget(name,"<span class='inputfield'><span class='fixed flag'>"+(value ? "on" : "off")+"</span><span tabIndex='"+this.tab_index+"'class='checkbox "+(value?"on":"")+"'></span></span>", options );
	var element = this.createWidget(name,"<span class='inputfield'><span tabIndex='"+this.tab_index+"' class='fixed flag checkbox "+(value ? "on" : "off")+"'>"+label+"</span></span>", options );
	this.tab_index++;

	var checkbox = element.querySelector(".wcontent .checkbox");
	checkbox.addEventListener("keypress", function(e) { 
		if(e.keyCode == 32)
			LiteGUI.trigger(this, "click");
	});

	element.addEventListener("click", function() {
		value = !value;
		element.querySelector("span.flag").innerHTML = value ? label_on : label_off;
		if(value)
			checkbox.classList.add("on");
		else
			checkbox.classList.remove("on");
		Inspector.onWidgetChange.call(that,element,name,value, options);
	});
	
	element.getValue = function() { 
		return value;
	}

	element.setValue = function(v,skip_event) { 
		if(v === undefined)
			return;
		value = v;
		if(	that.values[name] != v && !skip_event)
			LiteGUI.trigger( checkbox, "click" ); 
	};

	this.append(element,options);
	this.processElement(element, options);
	return element;
}

/**
* Widget to edit a set of boolean values using checkboxes
* @method addFlags
* @param {Object} value object that contains all the booleans 
* @param {Object} optional object with extra flags to insert
* @return {HTMLElement} the widget in the form of the DOM element that contains it
**/
Inspector.prototype.addFlags = function(flags, force_flags, options)
{
	var f = {};
	for(var i in flags)
		f[i] = flags[i];
	if(force_flags)
		for(var i in force_flags)
			if( typeof(f[i]) == "undefined" )
				f[i] = ( force_flags[i] ? true : false );

	for(var i in f)
	{
		var flag_options = {};
		for(var j in options)
			flag_options[j] = options[j];

		flag_options.callback = (function(j) {
				return function(v) { 
					flags[j] = v;
				}
			})(i);

		this.addCheckbox(i, f[i], flag_options );
	}
}

/**
* Widget to edit an enumeration using a combobox
* @method addCombo
* @param {string} name 
* @param {*} value 
* @param {Object} options, here is a list for this widget (check createWidget for a list of generic options):
* - values: a list with all the possible values, it could be an array, or an object, in case of an object, the key is the string to show, the value is the value to assign
* - disabled: true to disable
* - callback: function to call once an items is clicked
* @return {HTMLElement} the widget in the form of the DOM element that contains it
**/
Inspector.prototype.addCombo = function(name, value, options)
{
	options = this.processOptions(options);

	//value = value || "";
	var that = this;
	this.values[name] = value;
	
	this.tab_index++;

	var element = this.createWidget(name,"<span class='inputfield full inputcombo "+(options.disabled?"disabled":"")+"'></span>", options);
	element.options = options;

	var values = options.values || [];
	if(values.constructor === Function)
		values = options.values();

	/*
	if(!values)
		values = [];

	var index = 0;
	for(var i in values)
	{
		var item_value = values[i];
		var item_index = values.constructor === Array ? index : i;
		var item_title = values.constructor === Array ? item_value : i;
		if(item_value && item_value.title)
			item_title = item_value.title;
		code += "<option value='"+item_index+"' "+( item_value == value ? " selected":"")+" data-index='"+item_index+"'>" + item_title + "</option>";
		index++;
	}
	*/

	var code = "<select tabIndex='"+this.tab_index+"' "+(options.disabled?"disabled":"")+" class='"+(options.disabled?"disabled":"")+"'></select>";
	element.querySelector("span.inputcombo").innerHTML = code;
	setValues(values);
	
	var stop_event = false; //used internally

	var select = element.querySelector(".wcontent select");
	select.addEventListener("change", function(e) { 
		var index = e.target.value;
		value = values[index];
		if(stop_event)
			return;
		Inspector.onWidgetChange.call( that,element,name,value, options );
	});

	element.getValue = function()
	{
		return value;		
	}

	element.setValue = function(v, skip_event) { 
		if(v === undefined)
			return;
		value = v;
		var select = element.querySelector("select");
		var items = select.querySelectorAll("option");
		var index =  -1;
		if(values.constructor === Array)
			index = values.indexOf(v);
		else
		{
			//search the element index in the values
			var j = 0;
			for(var i in values)
			{
				if(values[j] == v)
				{
					index = j;
					break;
				}
				else
					j++;
			}
		}

		if(index == -1)
			return;
			
		stop_event = skip_event;

		for(var i in items)
		{
			var item = items[i];
			if(!item || !item.dataset) //weird bug
				continue;
			if( parseFloat(item.dataset["index"]) == index )
			{
				item.setAttribute("selected", true);
				select.selectedIndex = index;
			}
			else
				item.removeAttribute("selected");
		}
		
		stop_event = false;
	};

	function setValues(v, selected){
		if(!v)
			v = [];
		values = v;
		if(selected)
			value = selected;
		var code = "";
		var index = 0;
		for(var i in values)
		{
			var item_value = values[i];
			var item_index = values.constructor === Array ? index : i;
			var item_title = values.constructor === Array ? item_value : i;
			if(item_value && item_value.title)
				item_title = item_value.title;
			code += "<option value='"+item_index+"' "+( item_value == value ? " selected":"")+" data-index='"+item_index+"'>" + item_title + "</option>";
			index++;
		}
		element.querySelector("select").innerHTML = code;
	}

	element.setOptionValues = setValues;

	this.append(element,options);
	this.processElement(element, options);
	return element;
}

Inspector.prototype.addComboButtons = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;
	
	var code = "";
	if(options.values)
		for(var i in options.values)
			code += "<button class='wcombobutton "+(value == options.values[i] ? "selected":"")+"' data-name='options.values[i]'>" + options.values[i] + "</button>";

	var element = this.createWidget(name,code, options);
	var buttons = element.querySelectorAll( ".wcontent button" );
	LiteGUI.bind( buttons, "click", function(e) { 

		var buttonname = e.target.innerHTML;
		that.values[name] = buttonname;

		var elements = element.querySelectorAll(".selected");
		for(var i = 0; i < elements.length; ++i)
			elements[i].classList.remove("selected");
		this.classList.add("selected");

		Inspector.onWidgetChange.call( that,element,name,buttonname, options );
	});

	this.append(element,options);
	this.processElement(element, options);
	return element;
}

Inspector.prototype.addTags = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || [];
	var that = this;
	this.values[name] = value;
	
	var code = "<select>";
	if(options.values)
		for(var i in options.values)
			code += "<option>" + options.values[i] + "</option>";

	code += "</select><div class='wtagscontainer inputfield'></div>";

	var element = this.createWidget(name,"<span class='inputfield full'>"+code+"</span>", options);
	element.tags = {};

	//add default tags
	for(var i in options.value)
		inner_addtag(options.value[i]);

	//combo change
	var select_element = element.querySelector(".wcontent select");
	select_element.addEventListener("change", function(e) { 
		inner_addtag(e.target.value);
	});

	function inner_addtag(tagname)
	{
		if( element.tags[tagname] )
			return; //repeated tags no

		LiteGUI.trigger( element, "wbeforechange", element.tags);

		element.tags[tagname] = true;

		var tag = document.createElement("div");
		tag.data = tagname;
		tag.className = "wtag";
		tag.innerHTML = tagname+"<span class='close'>X</span>";

		tag.querySelector(".close").addEventListener("click", function(e) {
			var tagname = this.parentNode.data;
			delete element.tags[tagname];
			LiteGUI.remove(this.parentNode);
			LiteGUI.trigger( element, "wremoved", tagname );
			Inspector.onWidgetChange.call(that,element,name,element.tags, options);
		});

		element.querySelector(".wtagscontainer").appendChild(tag);

		that.values[name] = element.tags;
		if(options.callback)
			options.callback.call( element, element.tags ); 
		LiteGUI.trigger( element, "wchange", element.tags);
		LiteGUI.trigger( element, "wadded", tagname);
		if(that.onchange)
			that.onchange(name, element.tags, element);
	}

	this.append(element,options);
	this.processElement(element, options);
	return element;
}

/**
* Widget to select from a list of items
* @method addList
* @param {string} name 
* @param {*} value [Array or Object]
* @param {Object} options, here is a list for this widget (check createWidget for a list of generic options):
* - multiselection: allow multiple selection
* - callback: function to call once an items is clicked
* - selected: the item selected
* @return {HTMLElement} the widget in the form of the DOM element that contains it
**/
Inspector.prototype.addList = function(name, values, options)
{
	options = this.processOptions(options);

	var that = this;
	
	var list_height = "";
	if(options.height)
		list_height = "style='height: 100%; overflow: auto;'";
		//height = "style='height: "+options.height+"px; overflow: auto;'";

	var code = "<ul class='lite-list' "+list_height+" tabIndex='"+this.tab_index+"'><ul>";
	this.tab_index++;

	var element = this.createWidget(name,"<span class='inputfield full "+(options.disabled?"disabled":"")+"' style='height: 100%;'>"+code+"</span>", options);

	var infocontent = element.querySelector(".info_content");
	infocontent.style.height = "100%";

	var list_element = element.querySelector(".lite-list");

	var inputfield = element.querySelector(".inputfield");
	inputfield.style.height = "100%";
	inputfield.style.paddingBottom = "0.2em";

	var ul_elements = element.querySelectorAll("ul");
	for(var i = 0; i < ul_elements.length; ++i)
	{
		var ul = ul_elements[i];
		ul.addEventListener("focus",function() { 
			document.addEventListener("keydown",inner_key,true);
		});
		ul.addEventListener("blur",function() {
			document.removeEventListener("keydown",inner_key,true);
		});
	}

	function inner_key(e)
	{
		var selected = element.querySelector("li.selected");
		if( !selected )
			return;

		if(e.keyCode == 13) //intro
		{
			if(!selected)
				return;
			var value = values[ selected.dataset["pos"] ];
			if(options.callback_dblclick)
				options.callback_dblclick.call(that,value);
		}
		else if(e.keyCode == 40) //arrow down
		{
			var next = selected.nextSibling;
			if(next)
				LiteGUI.trigger(next, "click");
			if(selected.scrollIntoViewIfNeeded)
				selected.scrollIntoViewIfNeeded({block: "end", behavior: "smooth"});
		}
		else if(e.keyCode == 38) //arrow up
		{
			var prev = selected.previousSibling;
			if(prev)
				LiteGUI.trigger(prev,"click");
			if(selected.scrollIntoViewIfNeeded)
				selected.scrollIntoViewIfNeeded({block: "end", behavior: "smooth"});
		}
		else
			return;

		e.preventDefault();
		e.stopPropagation();
		return true;
	}

	function inner_item_click(e) { 

		if(options.multiselection)
			this.classList.toggle("selected");
		else
		{
			//batch action, jquery...
			var lis = element.querySelectorAll("li");
			for(var i = 0; i < lis.length; ++i)
				lis[i].classList.remove("selected");
			this.classList.add("selected");
		}

		var value = values[ this.dataset["pos"] ];
		//if(options.callback) options.callback.call(element,value); //done in onWidgetChange
		Inspector.onWidgetChange.call(that,element,name,value, options);
		LiteGUI.trigger(element, "wadded", value );
	}

	function inner_item_dblclick(e) { 
		var value = values[ this.dataset["pos"] ];
		if(options.callback_dblclick)
			options.callback_dblclick.call(that,value);
	}

	element.updateItems = function( new_values, item_selected )
	{
		item_selected = item_selected || options.selected;
		var code = "";
		values = new_values;
		var ul = this.querySelector("ul");
		ul.innerHTML = "";

		if(values)
			for(var i in values)
			{
				var	value = values[i];
				var li_element = insert_item( value, item_selected, i );
				ul.appendChild( li_element );
			}

		//ul.innerHTML = code;
		LiteGUI.bind( ul.querySelectorAll("li"), "click", inner_item_click );
	}

	function insert_item( value, selected, index )
	{
		var item_index = index; //to reference it
		var item_title = index; //to show in the list
		selected = !!selected;

		var item_style = null;
		var icon = "";
		if( value != null )
		{
			if( value.constructor === String || value.constructor === Number || value.constructor === Boolean )
			{
				item_title = String(value);
			}
			else if( value )
			{
				item_title = value.content || value.title || value.name || index;
				item_style = value.style;
				if(value.icon)
					icon = "<img src='"+value.icon+"' class='icon' /> ";
				if(value.selected)
					selected = true;
			}
		}

		var item_name = item_title;
		item_name = item_name.replace(/<(?:.|\n)*?>/gm, ''); //remove html tags that could break the html

		var li_element = document.createElement("li");
		li_element.classList.add( 'item-' + LiteGUI.safeName(item_index) );
		if( selected )
			li_element.classList.add( 'selected' );
		li_element.dataset["name"] = item_name;
		li_element.dataset["pos"] = item_index;
		li_element.value = value;
		if(item_style)
			li_element.setAttribute("style", item_style );
		li_element.innerHTML = icon + item_title;
		li_element.addEventListener( "click", inner_item_click );
		if(options.callback_dblclick)
			li_element.addEventListener( "dblclick", inner_item_dblclick );
		return li_element;
	}

	element.addItem = function( value, selected, name )
	{
		if(values.constructor !== Array)
		{
			console.error("cannot add item to list of object, only array");
			return;
		}
		values.push( value );
		var ul = this.querySelector("ul");
		var li_element = insert_item( value, selected);
		ul.appendChild( li_element );
	}

	element.removeItem = function(name)
	{
		var items = element.querySelectorAll(".wcontent li");
		for(var i = 0; i < items.length; i++)
		{
			if(items[i].dataset["name"] == name)
				LiteGUI.remove( items[i] );
		}
	}

	element.updateItems( values, options.selected );
	this.append(element,options);

	element.getSelected = function()
	{
		var r = [];
		var selected = this.querySelectorAll("ul li.selected");
		for(var i = 0; i < selected.length; ++i)
			r.push( selected[i].dataset["name"] );
		return r;
	}

	element.getByIndex = function(num)
	{
		var items = this.querySelectorAll("ul li");
		return items[num];
	}
	element.getIndex = element.getByIndex; //legacy

	element.selectIndex = function( num, add_to_selection )
	{
		var items = this.querySelectorAll("ul li");
		for(var i = 0; i < items.length; ++i)
		{
			var item = items[i];
			if(i == num)
				item.classList.add("selected");
			else if(!add_to_selection)
				item.classList.remove("selected");
		}
		return items[num];
	}

	element.deselectIndex = function( num )
	{
		var items = this.querySelectorAll("ul li");
		var item = items[num];
		if(item)
			item.classList.remove("selected");
		return item;
	}

	element.scrollToIndex = function(num)
	{
		var items = this.querySelectorAll("ul li");
		var item = items[num];
		if(!item)
			return;
		this.scrollTop = item.offsetTop;
	}

	element.selectAll = function()
	{
		var items = this.querySelectorAll("ul li");
		for(var i = 0; i < items.length; ++i)
		{
			var item = items[i];
			if( item.classList.contains("selected") )
				continue;
			LiteGUI.trigger( item, "click" );
		}
	}

	element.deselectAll = function()
	{
		//there has to be a more efficient way to do this
		var items = this.querySelectorAll("ul li");
		for(var i = 0; i < items.length; ++i)
		{
			var item = items[i];
			if( !item.classList.contains("selected") )
				continue;
			LiteGUI.trigger( item, "click" );
		}
	}

	element.setValue = function(v)
	{
		if(v === undefined)
			return;
		this.updateItems(v);
	}

	element.getNumberOfItems = function()
	{
		var items = this.querySelectorAll("ul li");
		return items.length;
	}

	element.filter = function( callback, case_sensitive )
	{
		var items = this.querySelectorAll("ul li");
		var use_string = false;

		if( callback && callback.constructor === String )
		{
			var needle = callback;
			if( case_sensitive )
				needle.toLowerCase();
			use_string = true;
			callback = function(v){ return ( (case_sensitive ? v : v.toLowerCase()).indexOf(needle) != -1); };
		}

		for(var i = 0; i < items.length; ++i)
		{
			var item = items[i];
			if(!callback)
			{
				item.style.display = "";
				continue;
			}

			var value = item.value;
			if(use_string && value != null && value.constructor !== String)
				value = item.innerHTML;

			if( !callback( value, item, item.classList.contains("selected") ) )
				item.style.display = "none";
			else
				item.style.display = "";
		}
	}

	element.selectByFilter = function(callback)
	{
		var items = this.querySelectorAll("ul li");
		for(var i = 0; i < items.length; ++i)
		{
			var item = items[i];
			var r = callback( item.value, item, item.classList.contains("selected") );
			if( r === true )
				item.classList.add("selected");
			else if( r === false )
				item.classList.remove("selected");
		}
	}

	if(options.height) 
		element.scrollTop = 0;
	this.processElement(element, options);
	return element;
}

Inspector.prototype.addButton = function(name, value, options)
{
	options = this.processOptions(options);

	value = options.button_text || value || "";
	var that = this;

	var button_classname = "";
	if(name === null)
		button_classname = "single";
	if(options.micro)
		button_classname += " micro";

	var attrs = "";
	if(options.disabled)
		attrs = "disabled='disabled'";

	var title = options.title || "";
	
	var element = this.createWidget(name,"<button title='"+title+"' class='litebutton "+button_classname+"' tabIndex='"+ this.tab_index + "' "+attrs+">"+value+"</button>", options);
	this.tab_index++;
	var button = element.querySelector("button");
	button.addEventListener("click", function(event) {
		Inspector.onWidgetChange.call( that, element, name, this.innerHTML, options, false, event);
		LiteGUI.trigger( button, "wclick", value );
	});
	this.append(element,options);

	element.wclick = function(callback) { 
		if(!options.disabled)
			LiteGUI.bind(this, "wclick", callback ); 
	}

	element.setValue = function(v)
	{
		if(v === undefined)
			return;
		button.innerHTML = v;
	}

	element.disable = function() { button.disabled = true; };
	element.enable = function() { button.disabled = false; };

	this.processElement(element, options);
	return element;
}

Inspector.prototype.addButtons = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;

	var code = "";
	//var w = "calc("+(100/value.length).toFixed(3)+"% - "+Math.floor(16/value.length)+"px);";
	var w = "calc( " + (100/value.length).toFixed(3) + "% - 4px )";
	var style = "width:"+w+"; width: -moz-"+w+"; width: -webkit-"+w+"; margin: 2px;";
	if(value && typeof(value) == "object")
	{
		for(var i in value)
		{
			var title = "";
			if( options.title && options.title.constructor === Array)
				title = options.title[i] || "";
			code += "<button class='litebutton' title='"+title+"' tabIndex='"+this.tab_index+"' style='"+style+"'>"+value[i]+"</button>";
			this.tab_index++;
		}
	}
	var element = this.createWidget(name,code, options);
	var buttons = element.querySelectorAll("button");
	for(var i = 0; i < buttons.length; ++i)
	{
		var button = buttons[i];
		button.addEventListener("click", function(evt) {
			Inspector.onWidgetChange.call(that, element, name, this.innerHTML, options, null, evt);
			LiteGUI.trigger( element, "wclick",this.innerHTML );
		});
	}

	this.append(element,options);
	this.processElement(element, options);
	return element;
}

Inspector.prototype.addIcon = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;

	var img_url = options.image;
	var width = options.width || options.size || 20;
	var height = options.height || options.size || 20;

	var element = this.createWidget(name,"<span class='icon' "+(options.title ? "title='"+options.title+"'" : "" )+" tabIndex='"+ this.tab_index + "'></span>", options);
	this.tab_index++;
	var content = element.querySelector("span.wcontent");
	var icon = element.querySelector("span.icon");

	var x = options.x || 0;
	if(options.index)
		x = options.index * -width;
	var y = value ? height : 0;

	element.style.minWidth = element.style.width = (width) + "px";
	element.style.margin = "0 2px"; element.style.padding = "0";
	content.style.margin = "0"; content.style.padding = "0";

	icon.style.display = "inline-block"
	icon.style.cursor = "pointer";
	icon.style.width = width + "px";
	icon.style.height = height + "px";
	icon.style.backgroundImage = "url('"+img_url+"')";
	icon.style.backgroundPosition = x + "px " + y + "px";

	icon.addEventListener("mousedown", function(e) {
		e.preventDefault();
		value = !value;
		var ret = Inspector.onWidgetChange.call(that,element,name, value, options);
		LiteGUI.trigger( element, "wclick", value);

		if(ret !== undefined)
			value = ret;

		var y = value ? height : 0;
		icon.style.backgroundPosition = x + "px " + y + "px";

		if(options.toggle === false) //blink
			setTimeout( function(){ icon.style.backgroundPosition = x + "px 0px"; value = false; },200 );

	});
	this.append(element,options);

	element.setValue = function(v, skip_event ) { 
		if(v === undefined)
			return;
		value = v;
		var y = value ? height : 0;
		icon.style.backgroundPosition = x + "px " + y + "px";
		if(!skip_event)
			Inspector.onWidgetChange.call(that,element,name, value, options);
	};
	element.getValue = function() { return value; };
	this.processElement(element, options);
	return element;
}

Inspector.prototype.addColor = function( name, value, options )
{
	options = this.processOptions(options);

	value = value || [0.0,0.0,0.0];
	var that = this;
	this.values[name] = value;
	
	var code = "<input tabIndex='"+this.tab_index+"' id='colorpicker-"+name+"' class='color' value='"+(value[0]+","+value[1]+","+value[2])+"' "+(options.disabled?"disabled":"")+"/>";
	this.tab_index++;

	if(options.show_rgb)
		code += "<span class='rgb-color'>"+Inspector.parseColor(value)+"</span>";
	var element = this.createWidget(name,code, options);
	this.append(element,options); //add now or jscolor dont work

	//create jsColor 
	var input_element = element.querySelector("input.color");
	var myColor = null;

	if( window.jscolor )
	{

		//SHOWS CONTEXTUAL MENU
		//block focusing
		/*
		input_element.addEventListener("contextmenu", function(e) { 
			if(e.button != 2) //right button
				return false;
			//create the context menu
			var contextmenu = new LiteGUI.ContextMenu( ["Copy in HEX","Copy in RGBA"], { event: e, callback: inner_action });
			e.preventDefault(); 
			e.stopPropagation();

			input_element.addEventListener("focus", block_focus , true);
			setTimeout(function(){ input_element.removeEventListener("focus", block_focus , true);},1000);

			return false;
		},true);	

		function block_focus(e)
		{
			e.stopPropagation();
			e.stopImmediatePropagation();
			e.preventDefault();
			return false;
		}

		function inner_action(v)
		{
			if(v == "Copy in HEX")
			{
				LiteGUI.toClipboard( "in HEX");
			}
			else
			{
				LiteGUI.toClipboard( "in RGB");
			}
		}
		*/

		myColor = new jscolor.color(input_element);
		myColor.pickerFaceColor = "#333";
		myColor.pickerBorderColor = "black";
		myColor.pickerInsetColor = "#222";
		myColor.rgb_intensity = 1.0;

		if(options.disabled) 
			myColor.pickerOnfocus = false; //this doesnt work

		if( value.constructor !== String && value.length && value.length > 2)
		{
			var intensity = 1.0;
			myColor.fromRGB(value[0]*intensity,value[1]*intensity,value[2]*intensity);
			myColor.rgb_intensity = intensity;
		}

		//update values in rgb format
		input_element.addEventListener("change", function(e) { 
			var rgbelement = element.querySelector(".rgb-color");
			if(rgbelement)
				rgbelement.innerHTML = LiteGUI.Inspector.parseColor(myColor.rgb);
		});

		myColor.onImmediateChange = function() 
		{
			var v = [ myColor.rgb[0] * myColor.rgb_intensity, myColor.rgb[1] * myColor.rgb_intensity, myColor.rgb[2] * myColor.rgb_intensity ];
			//Inspector.onWidgetChange.call(that,element,name,v, options);
			var event_data = [v.concat(), myColor.toString()];
			LiteGUI.trigger( element, "wbeforechange", event_data );
			that.values[name] = v;
			if(options.callback)
				options.callback.call( element, v.concat(), "#" + myColor.toString(), myColor );
			LiteGUI.trigger( element, "wchange", event_data );
			if(that.onchange) that.onchange(name, v.concat(), element);
		}

		//alpha dragger
		options.step = options.step || 0.01;
		options.dragger_class = "nano";

		var dragger = new LiteGUI.Dragger(1, options);
		element.querySelector('.wcontent').appendChild(dragger.root);
		dragger.input.addEventListener("change", function(e)
		{
			var v = parseFloat( this.value );
			myColor.rgb_intensity = v;
			if (myColor.onImmediateChange)
				myColor.onImmediateChange();
		});

		element.setValue = function(value,skip_event) { 
			myColor.fromRGB(value[0],value[1],value[2]);
			if(!skip_event)
				LiteGUI.trigger( dragger.input, "change" ); 
		};

		element.getValue = function() { 
			return value;
		};
	}
	else
	{
		input_element.addEventListener("change", function(e) { 
			var rgbelement = element.querySelector(".rgb-color");
			if(rgbelement)
				rgbelement.innerHTML = LiteGUI.Inspector.parseColor(myColor.rgb);
		});
	}

	this.processElement(element, options);
	return element;
}

Inspector.prototype.addFile = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"<span class='inputfield full whidden' style='width: calc(100% - 26px)'><span class='filename'></span></span><button class='litebutton' style='width:20px; margin-left: 2px;'>...</button><input type='file' size='100' class='file' value='"+value+"'/>", options);
	var content = element.querySelector(".wcontent");
	content.style.position = "relative";
	var input = element.querySelector(".wcontent input");
	var filename_element = element.querySelector(".wcontent .filename");
	if(value)
		filename_element.innerText = value.name;

	input.addEventListener("change", function(e) { 
		if(!e.target.files.length)
		{
			//nothing
			filename_element.innerText = "";
			Inspector.onWidgetChange.call(that, element, name, null, options);
			return;
		}

		var url = null;
		//var data = { url: url, filename: e.target.value, file: e.target.files[0], files: e.target.files };
		var file = e.target.files[0];
		file.files = e.target.files;
		if( options.generate_url )
			file.url = URL.createObjectURL( e.target.files[0] );
		filename_element.innerText = file.name;

		if(options.read_file)
		{
			 var reader = new FileReader();
			 reader.onload = function(e2){
				file.data = e2.target.result;
				Inspector.onWidgetChange.call( that, element, name, file, options );
			 }
			 if( options.read_file == "binary" )
				 reader.readAsArrayBuffer( file );
			 else if( options.read_file == "data_url" )
				 reader.readAsDataURL( file );
			 else
				 reader.readAsText( file );
		}
		else
		{
			Inspector.onWidgetChange.call( that, element, name, file, options );
		}
	});

	this.append(element,options);
	return element;
}

Inspector.prototype.addLine = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"<span class='line-editor'></span>", options);
	element.style.width = "100%";

	var line_editor = new LiteGUI.LineEditor(value,options);
	element.querySelector("span.line-editor").appendChild(line_editor);

	LiteGUI.bind( line_editor, "change", function(e) { 
		LiteGUI.trigger(element, "wbeforechange",[e.target.value]);
		if(options.callback)
			options.callback.call( element,e.target.value );
		LiteGUI.trigger(element, "wchange",[e.target.value]);
		Inspector.onWidgetChange.call(that,element,name,e.target.value, options);
	});

	this.append(element,options);
	return element;
}

Inspector.prototype.addTree = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var element = this.createWidget(name,"<div class='wtree inputfield full'></div>", options);
	
	var tree_root = element.querySelector(".wtree");
	if(options.height)
	{
		tree_root.style.height = typeof(options.height) == "number" ? options.height + "px" : options.height;
		tree_root.style.overflow = "auto";
	}

	var current = value;

	var tree = element.tree = new LiteGUI.Tree( value, options.tree_options );
	tree.onItemSelected = function(node, data) {
		if(options.callback)
			options.callback.call( element, node, data);
	};

	tree_root.appendChild(tree.root);

	element.setValue = function(v) { 
		tree.updateTree(v);
	};

	this.append(element,options);
	this.processElement(element, options);
	return element;
}

Inspector.prototype.addDataTree = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var element = this.createWidget(name,"<div class='wtree'></div>", options);
	
	var node = element.querySelector(".wtree");
	var current = value;

	inner_recursive(node,value);

	function inner_recursive( root_node, value)
	{
		for(var i in value)
		{
			var e = document.createElement("div");
			e.className = "treenode";
			if( typeof( value[i] ) == "object" )
			{
				e.innerHTML = "<span class='itemname'>" + i + "</span><span class='itemcontent'></span>";
				inner_recursive( e.querySelector(".itemcontent"), value[i] );
			}
			else
				e.innerHTML = "<span class='itemname'>" + i + "</span><span class='itemvalue'>" + value[i] + "</span>";
			root_node.appendChild(e);
		}
	}

	this.append(element,options);
	return element;
}

/**
* Widget to edit an array of values of a certain type
* @method addArray
* @param {string} name 
* @param {Array} value 
* @param {Object} options, here is a list for this widget (check createWidget for a list of generic options):
* - data_type: the type of every value inside the array
* - data_options: options for the widgets of every item in the array
* - max_items: max number of items to show from the array, default is 100
* - callback: function to call once an items inside the array has changed
* @return {HTMLElement} the widget in the form of the DOM element that contains it
**/
Inspector.prototype.addArray = function( name, value, options )
{
	var that = this;

	if( !value || value.constructor !== Array )
	{
		console.error("Inspector: Array widget value must be a valid array" );
		return;
	}

	options = this.processOptions(options);

	var type = options.data_type || "string";
	var max_items = options.max_items || 100;
	var container = null;

	//length widget
	this.widgets_per_row = 3;
	this.addInfo(name,null,{ name_width: "100%", width: "100% - 160px"});
	var length_widget = this.addString( "length", value.length || "0", { width: 100, callback: function(v){ 
		var v = parseInt(v);
		if(value < 0)
			value = 0;
		value.length = v;
		refresh.call( container );
	}});

	this.addButtons( null,["+","-"], { width: 60, callback: function(v){
		if(v == "+")
			value.length = value.length + 1;
		else if(value.length > 0)
			value.length = value.length - 1;
		length_widget.setValue( value.length );
		refresh.call( container );
	}});

	this.widgets_per_row = 1;
	container = this.addContainer( name, options );
	container.value = value;

	refresh.call( container );

	function refresh()
	{
		var container = this;
		var value = container.value;
		var size = Math.min( value.length, max_items );

		that.widgets_per_row += 1;
		container.innerHTML = "";

		for(var i = 0; i < size; ++i)
		{
			var v = null;
			if (value[i] !== undefined)
				v = value[i];
			var row = document.createElement("div");
			row.className = "array-row";
			row.innerHTML = "<span class='row-index'>" + i + "</span><span class='row-cell'></span><button style='width: 30px;' class='litebutton single row-trash'><img src='imgs/mini-icon-trash.png'/></button>";
			container.appendChild(row);

			var widget_row_container = row.querySelector('.row-cell');
			
			var item_options = { widget_parent: widget_row_container, callback: assign.bind({value: this.value, index: i}) };
			if(options.data_options)
				for(var j in options.data_options)
					item_options[j] = options.data_options[j];
			var w = that.add( type, null, v, item_options );

			/*
			that.addButton(null,"<img src='imgs/mini-icon-trash.png'/>", {  widget_parent: container, index: i, width: 30, callback: function(){
				if( value && value.length > (this.options.index-1))
				{
					value.splice( this.options.index,1 );
					length_widget.setValue( value.length, true );
					refresh.call( container );
				}
			}});
			*/
		}
		that.widgets_per_row -= 1;
	}

	function assign(v)
	{
		this.value[ this.index ] = v;
		if(options.callback)
			options.callback.call( container, this.value, this.index );
		//todo: trigger change
	}

	container.setValue = function(v)
	{
		this.value = v;
		refresh.call(container);
	}

	container.getValue = function()
	{
		return this.value = v;
	}

	//this.append(element,options);
	return container;
}

//***** containers ********/
//creates an empty container but it is not set active
Inspector.prototype.addContainer = function(name, options)
{
	if(name && name.constructor !== String)
		console.warn("LiteGUI.Inspector.addContainer first parameter must be a string with the name");
	var element = this.startContainer(null,options);
	this.endContainer();
	return element;
}

//creates an empty container and sets its as active
Inspector.prototype.startContainer = function(name, options)
{
	options = this.processOptions(options);

	var element = document.createElement("DIV");
	element.className = "wcontainer";
	this.applyOptions(element, options);
	this.row_number = 0;

	this.append( element );
	this.pushContainer( element );

	if(options.widgets_per_row)
		this.widgets_per_row = options.widgets_per_row;

	if(options.height)
	{
		element.style.height = LiteGUI.sizeToCSS( options.height );
		element.style.overflow = "auto";
	}

	element.refresh = function()
	{
		if(element.on_refresh)
			element.on_refresh.call(this, element);
	}

	return element;
}

Inspector.prototype.endContainer = function(name, options)
{
	this.popContainer();
}

//it is like a group but they cant be nested inside containers
Inspector.prototype.addSection = function( name, options )
{
	options = this.processOptions(options);
	var that = this;

	if(this.current_section)
		this.current_section.end();

	var element = document.createElement("DIV");
	element.className = "wsection";
	if(!name) 
		element.className += " notitle";
	if(options.className)
		element.className += " " + options.className;
	if(options.collapsed)
		element.className += " collapsed";

	if(options.id)
		element.id = options.id;
	if(options.instance)
		element.instance = options.instance;

	var code = "";
	if(name)
		code += "<div class='wsectiontitle'>"+(options.no_collapse ? "" : "<span class='switch-section-button'></span>")+name+"</div>";
	code += "<div class='wsectioncontent'></div>";
	element.innerHTML = code;

	//append to inspector
	element._last_container_stack = this._current_container_stack.concat();
	//this.append( element ); //sections are added to the root, not to the current container
	this.root.appendChild( element );
	this.sections.push( element );

	element.sectiontitle = element.querySelector(".wsectiontitle");

	if(name)
		element.sectiontitle.addEventListener("click",function(e) {
			if(e.target.localName == "button") 
				return;
			element.classList.toggle("collapsed");
			var seccont = element.querySelector(".wsectioncontent");
			seccont.style.display = seccont.style.display === "none" ? null : "none";
			if(options.callback)
				options.callback.call( element, !element.classList.contains("collapsed") );
		});

	if(options.collapsed)
		element.querySelector(".wsectioncontent").style.display = "none";

	this.setCurrentSection( element );

	if(options.widgets_per_row)
		this.widgets_per_row = options.widgets_per_row;

	element.refresh = function()
	{
		if(element.on_refresh)
			element.on_refresh.call(this, element);
	}

	element.end = function()
	{
		if(that.current_section != this)
			return;

		that._current_container_stack = this._last_container_stack;
		that._current_container = null;

		var content = this.querySelector(".wsectioncontent");
		if(!content)
			return;
		if( that.isContainerInStack( content ) )
			that.popContainer( content );
		that.current_section = null;
	}

	return element;
}

//change current section (allows to add widgets to previous sections)
Inspector.prototype.setCurrentSection = function( section )
{
	if( this.current_section == section )
		return;

	this.current_section = section;

	var parent = section.parentNode;
	this.popContainer( parent ); //go back till that container

	var content = section.querySelector(".wsectioncontent");
	this.pushContainer( content );
}

Inspector.prototype.getCurrentSection = function()
{
	for(var i = this._current_container_stack.length - 1; i >= 0; --i)
	{
		var container = this._current_container_stack[i];
		if(container.classList.contains("wsectioncontent"))
			return container.parentNode;
	}
	return null;
}

Inspector.prototype.endCurrentSection = function()
{
	if(this.current_section)
		this.current_section.end();
}

//A container of widgets with a title 
Inspector.prototype.beginGroup = function( name, options )
{
	options = this.processOptions(options);

	var element = document.createElement("DIV");
	element.className = "wgroup";
	name = name || "";
	element.innerHTML = "<div class='wgroupheader "+ (options.title ? "wtitle" : "") +"'><span class='switch-section-button'></span>"+name+"</div>";
	element.group = true;

	var content = document.createElement("DIV");
	content.className = "wgroupcontent";
	if(options.collapsed)
		content.style.display = "none";

	if( options.height )
		content.style.height = LiteGUI.sizeToCSS( options.height );
	if( options.scrollable )
		content.style.overflow = "auto";

	element.appendChild( content );

	var collapsed = options.collapsed || false;
	var header = element.querySelector(".wgroupheader");
	if(collapsed)
		header.classList.add("collapsed");
	header.addEventListener("click", function(e) { 
		var style = element.querySelector(".wgroupcontent").style;
		style.display = style.display === "none" ? "" : "none";
		collapsed = !collapsed;
		if(collapsed)
			header.classList.add("collapsed");
		else
			header.classList.remove("collapsed");
		//element.querySelector(".switch-section-button").innerHTML = (collapsed ? "+" : "-");
		e.preventDefault();
	});

	this.append( element, options );
	this.pushContainer( content );
	return element;
}

Inspector.prototype.endGroup = function()
{
	do
	{
		this.popContainer();
	}
	while( this._current_container && !this._current_container.classList.contains("wgroupcontent") )
}

/**
* Creates a title bar in the widgets list to help separate widgets
* @method addTitle
* @param {string} title 
* @param {Object} options
* @return {HTMLElement} the widget in the form of the DOM element that contains it
**/
Inspector.prototype.addTitle = function(title,options)
{
	options = this.processOptions(options);

	var element = document.createElement("DIV");
	var code = "<span class='wtitle'><span class='text'>"+title+"</span>";
	if(options.help)
	{
		code += "<span class='help'><div class='help-content'>"+options.help+"</div></span>";
	}
	code += "</span>";
	element.innerHTML = code;
	element.setValue = function(v) { 
		this.querySelector(".text").innerHTML = v;
	};
	this.row_number = 0;
	this.append(element, options);
	return element;
}


Inspector.prototype.scrollTo = function( id )
{
	var element = this.root.querySelector("#" + id );
	if(!element)
		return;
	var top = this.root.offsetTop;
	var delta = element.offsetTop - top;
	this.root.parentNode.parentNode.scrollTop = delta;
}

Inspector.prototype.processOptions = function(options)
{
	if(typeof(options) == "function")
		options = { callback: options };
	return options || {};
}

Inspector.prototype.processElement = function(element, options)
{
	if(options.callback_update && element.setValue)
	{
		element.on_update = function(){
			this.setValue( options.callback_update.call(this), true );
		}
	}
}

Inspector.prototype.updateWidgets = function()
{
	for(var i = 0; i < this.widgets.length; ++i)
	{
		var widget = this.widgets[i];
		if(widget.on_update)
			widget.on_update( widget );
	}
}

Inspector.parseColor = function(color)
{
	return "<span style='color: #FAA'>" + color[0].toFixed(2) + "</span>,<span style='color: #AFA'>" + color[1].toFixed(2) + "</span>,<span style='color: #AAF'>" + color[2].toFixed(2) + "</span>";
}

LiteGUI.Inspector = Inspector;
